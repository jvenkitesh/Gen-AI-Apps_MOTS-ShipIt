import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoutingGuideEntry } from "@/lib/estimate/types";

const ROUTING_GUIDE_COLUMNS =
  "id, geography, origin_hub, state, state_code, gateway_city, street_address, zipcode, corridor, distance_miles, transit_days, mode, transport, carrier, freight_cost_dollars, weight_break";

// Weight breaks in the routing guide are written like "<= 100 lbs" or "> 100 lbs".
function matchesWeightBreak(weightBreak: string | null, weightPounds: number): boolean {
  if (!weightBreak) return true;
  const m = weightBreak.match(/(<=|>=|<|>)\s*(\d+(?:\.\d+)?)/);
  if (!m) return true;
  const limit = Number(m[2]);
  switch (m[1]) {
    case "<=": return weightPounds <= limit;
    case ">=": return weightPounds >= limit;
    case "<": return weightPounds < limit;
    default: return weightPounds > limit;
  }
}

// KB1: the routing guide entry for a ship-to. Prefers an exact zip match, then the
// state's gateway, then the entry whose weight break fits the shipment weight.
export async function lookupRoutingGuideEntry(
  supabase: SupabaseClient,
  params: { geography: string; stateCode: string; zipcode: string | null; weightPounds: number }
): Promise<RoutingGuideEntry | null> {
  const { data, error } = await supabase
    .schema("transportation_shipment")
    .from("routing_guide")
    .select(ROUTING_GUIDE_COLUMNS)
    .eq("geography", params.geography)
    .eq("state_code", params.stateCode);

  if (error) throw new Error(`Routing guide lookup failed: ${error.message}`);

  const entries = (data ?? []).map((row) => ({
    ...row,
    freight_cost_dollars: Number(row.freight_cost_dollars),
  })) as RoutingGuideEntry[];
  if (entries.length === 0) return null;

  const fitsWeight = entries.filter((e) => matchesWeightBreak(e.weight_break, params.weightPounds));
  const candidates = fitsWeight.length > 0 ? fitsWeight : entries;
  return candidates.find((e) => e.zipcode === params.zipcode) ?? candidates[0];
}
