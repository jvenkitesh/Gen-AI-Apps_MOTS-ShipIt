import type { SupabaseClient } from "@supabase/supabase-js";
import type { LoadRow } from "@/lib/freight/loadQueries";

export type CarrierTier = "preferred" | "approved" | "probationary" | "blocked";

export type CarrierRecord = {
  id: string;
  name: string;
  tier: CarrierTier;
  status: "active" | "inactive";
  modes: string[];
  equipment_types: string[];
  service_history: { last_successful_booking_at?: string; successful_bookings?: number };
};

export type RoutingGuideLane = {
  carrier: string;
  origin_hub: string;
  state_code: string;
  mode: string;
  corridor: string;
  transit_days: number;
};

export type Candidate = {
  carrierId: string;
  name: string;
  tier: CarrierTier;
  score: number;
  reasonCodes: string[];
  lane: { corridor: string; mode: string; transit_days: number } | null;
};
export type Excluded = { carrierId: string; name: string; tier: CarrierTier; exclusionReason: string };
export type CandidateList = { candidates: Candidate[]; excluded: Excluded[] };

export const RANKING_REASON_TEXT: Record<string, string> = {
  lane_match: "Enabled in the routing guide for this destination state",
  origin_hub_match: "Load starts in the routing guide's origin hub state",
  tier_preferred: "Preferred carrier",
  tier_approved: "Approved carrier",
  tier_probationary: "Probationary carrier",
  equipment_match: "Has the trailer type this load needs",
  equipment_unverified: "Trailer types not on file yet",
  service_history_recent: "Booked successfully in the last 30 days",
  service_history_some: "Booked successfully in the last 90 days",
};

export const EXCLUSION_REASON_TEXT: Record<string, string> = {
  carrier_inactive: "Carrier is inactive",
  tier_blocked: "Carrier is blocked",
  tier_not_allowed: "Carrier tier isn't allowed by the customer's sourcing policy",
  policy_has_no_carrier_tiers: "The sourcing policy allows no carrier tiers yet",
  not_in_routing_guide_for_lane: "Not enabled in the routing guide for this destination",
  equipment_mismatch: "Doesn't have the trailer type this load needs",
};

// Weights sum to 1.0. Deterministic at MVP; a statistical model can replace this later.
const WEIGHTS = {
  lane: 0.45,
  originHub: 0.1,
  tier: { preferred: 0.25, approved: 0.18, probationary: 0.08 } as Record<string, number>,
  equipment: 0.1,
  historyRecent: 0.1,
  historySome: 0.05,
};

const DAY_MS = 24 * 60 * 60 * 1000;

// "Memphis, TN" -> "TN"
const hubState = (originHub: string) => originHub.split(",").pop()?.trim().toUpperCase() ?? "";

// C3: pure scoring. Every carrier ends up either a candidate (with reasons) or excluded (with a reason).
export function rankCarriers(params: {
  load: Pick<LoadRow, "origin_state_code" | "destination_state_code" | "equipment_type">;
  carriers: CarrierRecord[];
  lanes: RoutingGuideLane[];
  allowedTiers: string[];
  now?: Date;
}): CandidateList {
  const now = params.now ?? new Date();
  const candidates: Candidate[] = [];
  const excluded: Excluded[] = [];
  const seen = new Set<string>();

  for (const carrier of params.carriers) {
    if (seen.has(carrier.id)) continue;
    seen.add(carrier.id);
    const exclude = (exclusionReason: string) =>
      excluded.push({ carrierId: carrier.id, name: carrier.name, tier: carrier.tier, exclusionReason });

    if (carrier.status !== "active") { exclude("carrier_inactive"); continue; }
    if (carrier.tier === "blocked") { exclude("tier_blocked"); continue; }
    if (params.allowedTiers.length === 0) { exclude("policy_has_no_carrier_tiers"); continue; }
    if (!params.allowedTiers.includes(carrier.tier)) { exclude("tier_not_allowed"); continue; }

    const lane = params.lanes.find(
      (l) => l.carrier === carrier.name && l.state_code === params.load.destination_state_code
    );
    if (!lane) { exclude("not_in_routing_guide_for_lane"); continue; }

    if (carrier.equipment_types.length > 0 && !carrier.equipment_types.includes(params.load.equipment_type)) {
      exclude("equipment_mismatch");
      continue;
    }

    const reasonCodes = ["lane_match"];
    let score = WEIGHTS.lane;

    if (params.load.origin_state_code && hubState(lane.origin_hub) === params.load.origin_state_code) {
      reasonCodes.push("origin_hub_match");
      score += WEIGHTS.originHub;
    }

    reasonCodes.push(`tier_${carrier.tier}`);
    score += WEIGHTS.tier[carrier.tier] ?? 0;

    if (carrier.equipment_types.length === 0) {
      reasonCodes.push("equipment_unverified");
    } else {
      reasonCodes.push("equipment_match");
      score += WEIGHTS.equipment;
    }

    const lastBooking = carrier.service_history?.last_successful_booking_at;
    if (lastBooking) {
      const ageDays = (now.getTime() - new Date(lastBooking).getTime()) / DAY_MS;
      if (ageDays <= 30) { reasonCodes.push("service_history_recent"); score += WEIGHTS.historyRecent; }
      else if (ageDays <= 90) { reasonCodes.push("service_history_some"); score += WEIGHTS.historySome; }
    }

    candidates.push({
      carrierId: carrier.id,
      name: carrier.name,
      tier: carrier.tier,
      score: Math.round(Math.min(score, 1) * 100) / 100,
      reasonCodes,
      lane: { corridor: lane.corridor, mode: lane.mode, transit_days: lane.transit_days },
    });
  }

  candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return { candidates, excluded };
}

export async function loadRankingInputs(supabase: SupabaseClient, load: LoadRow) {
  const [carriersResult, lanesResult, policyResult] = await Promise.all([
    supabase
      .schema("data_foundation")
      .from("carriers")
      .select("id, name, tier, status, modes, equipment_types, service_history"),
    supabase
      .schema("transportation_shipment")
      .from("routing_guide")
      .select("carrier, origin_hub, state_code, mode, corridor, transit_days")
      .eq("geography", "NA")
      .eq("state_code", load.destination_state_code ?? ""),
    load.evaluated_policy_id
      ? supabase
          .schema("operational_excellence_governance")
          .from("sourcing_policies")
          .select("carrier_tiers")
          .eq("id", load.evaluated_policy_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (carriersResult.error) throw new Error(`Loading carriers failed: ${carriersResult.error.message}`);
  if (lanesResult.error) throw new Error(`Loading the routing guide failed: ${lanesResult.error.message}`);
  if (policyResult.error) throw new Error(`Loading the sourcing policy failed: ${policyResult.error.message}`);

  const tiers = (policyResult.data as { carrier_tiers?: unknown } | null)?.carrier_tiers;
  return {
    carriers: (carriersResult.data ?? []) as CarrierRecord[],
    lanes: (lanesResult.data ?? []) as RoutingGuideLane[],
    allowedTiers: Array.isArray(tiers) ? (tiers as string[]) : [],
  };
}

// Zero candidates must never leave a load silently stuck in sourcing: raise one open
// no_candidates exception per load version. Needs the service role client.
export async function raiseNoCandidatesException(admin: SupabaseClient, load: LoadRow, excluded: Excluded[]) {
  const { data: existing, error: findError } = await admin
    .schema("operational_excellence_governance")
    .from("operational_exceptions")
    .select("id")
    .eq("load_id", load.id)
    .eq("load_version", load.version)
    .eq("trigger_type", "no_candidates")
    .eq("status", "open")
    .limit(1);
  if (findError) throw new Error(`Checking exceptions failed: ${findError.message}`);
  if (existing && existing.length > 0) return;

  const { error } = await admin
    .schema("operational_excellence_governance")
    .from("operational_exceptions")
    .insert({
      load_id: load.id,
      load_version: load.version,
      trigger_type: "no_candidates",
      details: { excluded: excluded.map((e) => ({ carrier: e.name, reason: e.exclusionReason })) },
      recommended_action: "No carrier passed the filters. Add a carrier for this lane, or review carrier tiers and equipment.",
      risk_level: "high",
      sla_deadline: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    });
  if (error) throw new Error(`Raising the no_candidates exception failed: ${error.message}`);
}
