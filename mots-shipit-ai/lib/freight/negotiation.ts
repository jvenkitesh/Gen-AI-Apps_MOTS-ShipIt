import type { SupabaseClient } from "@supabase/supabase-js";
import { extractOfferFromReply } from "@/lib/ai/offerExtractor";
import { getFreshCompliance, COMPLIANCE_REASON_TEXT } from "@/lib/freight/compliance";
import { getLoad, type LoadRow } from "@/lib/freight/loadQueries";
import { sendCarrierMessage } from "@/lib/freight/outreach";
import { assertNotPaused, ScopePausedError } from "@/lib/freight/controlPlane";
import type { UserRole } from "@/types/userRole";

export class NegotiationError extends Error {
  constructor(message: string, readonly code: string, readonly httpStatus: number) {
    super(message);
  }
}

export type OfferRow = {
  id: string;
  load_id: string;
  load_version: number;
  carrier_id: string;
  rate_dollars: number;
  terms: Record<string, unknown>;
  confidence: number | null;
  evidence: string | null;
  status: "proposed" | "countered" | "accepted" | "rejected" | "expired" | "blocked";
  counter_rate_dollars: number | null;
  decision_note: string | null;
  created_at: string;
};

const OFFER_COLUMNS =
  "id, load_id, load_version, carrier_id, rate_dollars, terms, confidence, evidence, status, counter_rate_dollars, decision_note, created_at";
const OPEN_LOAD_STATUSES = new Set(["sourcing", "negotiating"]);
const NEGOTIATION_ROLES: UserRole[] = ["administrator", "supply_chain_operations_manager", "transportation_planner"];
const UNLIMITED_APPROVERS: UserRole[] = ["administrator", "supply_chain_operations_manager"];
const LOW_CONFIDENCE_SLA_MINUTES = 5;

const minConfidence = () => {
  const n = Number(process.env.OFFER_MIN_CONFIDENCE);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.8;
};

async function raiseException(admin: SupabaseClient, load: LoadRow, fields: {
  trigger_type: string; details: Record<string, unknown>; recommended_action: string; risk_level: string; slaMinutes: number;
}) {
  const { error } = await admin.schema("operational_excellence_governance").from("operational_exceptions").insert({
    load_id: load.id,
    load_version: load.version,
    trigger_type: fields.trigger_type,
    details: fields.details,
    recommended_action: fields.recommended_action,
    risk_level: fields.risk_level,
    sla_deadline: new Date(Date.now() + fields.slaMinutes * 60_000).toISOString(),
  });
  if (error) throw new Error(`Raising the ${fields.trigger_type} exception failed: ${error.message}`);
}

async function requireOpenLoad(supabase: SupabaseClient, loadId: string): Promise<LoadRow> {
  const load = await getLoad(supabase, loadId);
  if (!load) throw new NegotiationError("Load not found.", "NOT_FOUND", 404);
  if (!OPEN_LOAD_STATUSES.has(load.status)) {
    throw new NegotiationError(`Negotiation is closed: the load is ${load.status}.`, "LOAD_NOT_OPEN", 409);
  }
  try {
    await assertNotPaused(supabase, {
      agent: "negotiation",
      loadId: load.id,
      customerId: load.customer_id,
      originState: load.origin_state_code,
      destinationState: load.destination_state_code,
    });
  } catch (err) {
    if (err instanceof ScopePausedError) throw new NegotiationError(err.message, "PAUSED", 409);
    throw err;
  }
  return load;
}

export type ReplyOutcome =
  | { kind: "opted_out" }
  | { kind: "no_offer"; note: string }
  | { kind: "needs_review"; reason: string }
  | { kind: "offer"; offer: OfferRow; blocked: boolean };

// C5: a carrier's reply (pasted by a user until inbound provider webhooks exist) becomes a
// structured offer. The rate ceiling is checked here in code; the model never sees it.
export async function recordCarrierReply(params: {
  supabase: SupabaseClient;
  admin: SupabaseClient;
  loadId: string;
  carrierId: string;
  replyText: string;
  userId: string;
}): Promise<ReplyOutcome> {
  const { supabase, admin, carrierId, replyText, userId } = params;
  const load = await requireOpenLoad(supabase, params.loadId);

  const { data: outbound } = await admin
    .schema("transportation_shipment")
    .from("carrier_interactions")
    .select("id, channel, carrier_contact_id, outreach_mode")
    .eq("load_id", load.id)
    .eq("load_version", load.version)
    .eq("carrier_id", carrierId)
    .eq("direction", "outbound")
    .in("status", ["sent", "simulated"])
    .order("created_at", { ascending: false })
    .limit(1);
  const lastOutbound = outbound?.[0];
  if (!lastOutbound) {
    throw new NegotiationError("This carrier hasn't been contacted for the current load version.", "NOT_CONTACTED", 409);
  }

  const { data: inbound, error: inboundError } = await admin
    .schema("transportation_shipment")
    .from("carrier_interactions")
    .insert({
      load_id: load.id,
      load_version: load.version,
      carrier_id: carrierId,
      carrier_contact_id: lastOutbound.carrier_contact_id,
      batch_id: crypto.randomUUID(),
      direction: "inbound",
      channel: lastOutbound.channel,
      outreach_mode: lastOutbound.outreach_mode,
      status: "received",
      disclosure_text: "",
      message_text: replyText,
      sent_by: userId,
    })
    .select("id")
    .single();
  if (inboundError || !inbound) throw new Error(`Logging the reply failed: ${inboundError?.message ?? "no row"}`);

  // "STOP" opts the carrier's contact out of all future outreach.
  if (/^\s*stop\b/i.test(replyText)) {
    if (lastOutbound.carrier_contact_id) {
      await admin.schema("data_foundation").from("carrier_contacts").update({ opt_out: true }).eq("id", lastOutbound.carrier_contact_id);
    }
    return { kind: "opted_out" };
  }

  const extracted = await extractOfferFromReply(replyText);
  if (!extracted || extracted.confidence < minConfidence()) {
    const reason = !extracted
      ? "The reply couldn't be read automatically (AI extraction unavailable)."
      : `The price in the reply is unclear (confidence ${Math.round(extracted.confidence * 100)}%).`;
    await raiseException(admin, load, {
      trigger_type: "low_confidence_extraction",
      details: { carrier_id: carrierId, interaction_id: inbound.id, reply_excerpt: replyText.slice(0, 500), extracted },
      recommended_action: "Read the carrier's reply and enter or confirm the offer by hand.",
      risk_level: "high",
      slaMinutes: LOW_CONFIDENCE_SLA_MINUTES,
    });
    return { kind: "needs_review", reason };
  }
  if (!extracted.has_offer || extracted.rate_dollars === null) {
    return { kind: "no_offer", note: extracted.available === false ? "The carrier declined or isn't available." : "No price found in the reply." };
  }

  const rate = extracted.rate_dollars;
  const aboveCeiling = rate > Number(load.rate_ceiling_dollars);
  const { data: offer, error: offerError } = await admin
    .schema("transportation_shipment")
    .from("carrier_offers")
    .insert({
      load_id: load.id,
      load_version: load.version,
      carrier_id: carrierId,
      source_interaction_id: inbound.id,
      rate_dollars: rate,
      terms: { available: extracted.available, ...extracted.terms },
      confidence: extracted.confidence,
      evidence: extracted.evidence,
      status: aboveCeiling ? "blocked" : "proposed",
      decision_note: aboveCeiling ? "Above the rate ceiling: negotiation stopped." : null,
      created_by: userId,
    })
    .select(OFFER_COLUMNS)
    .single<OfferRow>();
  if (offerError || !offer) throw new Error(`Saving the offer failed: ${offerError?.message ?? "no row"}`);

  if (aboveCeiling) {
    await raiseException(admin, load, {
      trigger_type: "rate_above_ceiling",
      details: { carrier_id: carrierId, offer_id: offer.id, offered_rate_dollars: rate },
      recommended_action: "The carrier asked for more than the rate ceiling. Counter within the ceiling, choose another carrier, or raise the ceiling in the TMS.",
      risk_level: "medium",
      slaMinutes: 60,
    });
  }
  return { kind: "offer", offer, blocked: aboveCeiling };
}

// Approve, counter or reject an offer. Approval re-checks the ceiling, the user's approval
// authority and a fresh compliance check at this moment (fail closed).
export async function respondToOffer(params: {
  supabase: SupabaseClient;
  admin: SupabaseClient;
  offerId: string;
  action: "approve" | "counter" | "reject";
  counterRateDollars?: number;
  note?: string;
  userId: string;
  role: UserRole;
}): Promise<OfferRow> {
  const { supabase, admin, offerId, action, userId, role } = params;
  if (!NEGOTIATION_ROLES.includes(role)) {
    throw new NegotiationError("Your role can't respond to offers.", "FORBIDDEN", 403);
  }

  const { data: offer, error } = await admin
    .schema("transportation_shipment")
    .from("carrier_offers")
    .select(OFFER_COLUMNS)
    .eq("id", offerId)
    .maybeSingle<OfferRow>();
  if (error) throw new Error(`Loading the offer failed: ${error.message}`);
  if (!offer) throw new NegotiationError("Offer not found.", "NOT_FOUND", 404);

  const load = await requireOpenLoad(supabase, offer.load_id);
  if (offer.load_version !== load.version) {
    throw new NegotiationError("This offer was for an older version of the load.", "OFFER_STALE", 409);
  }
  if (offer.status !== "proposed" && offer.status !== "countered") {
    throw new NegotiationError(`This offer is already ${offer.status}.`, "OFFER_CLOSED", 409);
  }

  const ceiling = Number(load.rate_ceiling_dollars);
  const now = new Date().toISOString();
  let update: Record<string, unknown>;

  if (action === "reject") {
    update = { status: "rejected", decision_note: params.note ?? null };
  } else if (action === "counter") {
    const counter = params.counterRateDollars;
    if (!counter || counter <= 0) throw new NegotiationError("Enter a counter rate.", "VALIDATION_ERROR", 400);
    if (counter > ceiling) {
      throw new NegotiationError("A counter can't go above the load's rate ceiling.", "ABOVE_CEILING", 422);
    }
    await sendCarrierMessage({
      admin,
      load,
      carrierId: offer.carrier_id,
      subject: `Load ${load.external_id}: counter-offer`,
      body: `Thanks for your quote on load ${load.external_id}. We can offer $${counter.toFixed(2)} all-in. Reply YES to accept, or send your best rate.`,
      userId,
    });
    update = { status: "countered", counter_rate_dollars: counter, decision_note: params.note ?? null };
  } else {
    const rate = Number(offer.rate_dollars);
    if (rate > ceiling) throw new NegotiationError("This offer is above the rate ceiling and can't be approved.", "ABOVE_CEILING", 422);

    if (!UNLIMITED_APPROVERS.includes(role)) {
      const { data: policy } = await admin
        .schema("operational_excellence_governance")
        .from("sourcing_policies")
        .select("approval_thresholds")
        .eq("id", load.evaluated_policy_id ?? "00000000-0000-0000-0000-000000000000")
        .maybeSingle();
      const limit = Number((policy?.approval_thresholds as { approval_required_above_dollars?: number } | null)?.approval_required_above_dollars);
      if (!Number.isFinite(limit) || rate > limit) {
        throw new NegotiationError(
          Number.isFinite(limit)
            ? `Offers above $${limit.toFixed(2)} need an operations manager or administrator to approve.`
            : "This customer's policy sets no approval limit for planners. An operations manager or administrator must approve.",
          "NEEDS_ESCALATION",
          403
        );
      }
    }

    const compliance = await getFreshCompliance(admin, offer.carrier_id);
    if (compliance.state === "stale") {
      throw new NegotiationError(compliance.reason, "COMPLIANCE_UNAVAILABLE", 409);
    }
    if (compliance.check.result === "block") {
      const why = compliance.check.reasons.map((r) => COMPLIANCE_REASON_TEXT[r] ?? r).join("; ");
      throw new NegotiationError(`The carrier failed its compliance check: ${why || "blocked"}.`, "COMPLIANCE_BLOCKED", 409);
    }
    update = { status: "accepted", decision_note: params.note ?? null };
  }

  const { data: updated, error: updateError } = await admin
    .schema("transportation_shipment")
    .from("carrier_offers")
    .update({ ...update, decided_by: userId, decided_at: now, updated_at: now })
    .eq("id", offer.id)
    .in("status", ["proposed", "countered"])
    .select(OFFER_COLUMNS)
    .single<OfferRow>();
  if (updateError || !updated) {
    throw new NegotiationError("The offer changed while you were responding. Refresh and try again.", "OFFER_CHANGED", 409);
  }
  return updated;
}

// When the TMS sends a new load version, open offers for older versions expire. An offer a
// carrier already accepted surfaces as an exception instead of being silently discarded.
export async function expireOffersForOldVersions(admin: SupabaseClient, loadId: string, newVersion: number) {
  const now = new Date().toISOString();
  const { error } = await admin
    .schema("transportation_shipment")
    .from("carrier_offers")
    .update({ status: "expired", decision_note: `Load changed to version ${newVersion}.`, updated_at: now })
    .eq("load_id", loadId)
    .lt("load_version", newVersion)
    .in("status", ["proposed", "countered"]);
  if (error) throw new Error(`Expiring old offers failed: ${error.message}`);

  const { data: accepted, error: acceptedError } = await admin
    .schema("transportation_shipment")
    .from("carrier_offers")
    .select("id, carrier_id, load_version, rate_dollars")
    .eq("load_id", loadId)
    .lt("load_version", newVersion)
    .eq("status", "accepted");
  if (acceptedError) throw new Error(`Checking accepted offers failed: ${acceptedError.message}`);
  if (accepted && accepted.length > 0) {
    const { error: exceptionError } = await admin.schema("operational_excellence_governance").from("operational_exceptions").insert({
      load_id: loadId,
      load_version: newVersion,
      trigger_type: "load_changed_post_acceptance",
      details: { accepted_offers: accepted },
      recommended_action: "A carrier already accepted the earlier terms. Confirm the new terms with that carrier or cancel the acceptance.",
      risk_level: "high",
      sla_deadline: new Date(Date.now() + 60 * 60_000).toISOString(),
    });
    if (exceptionError) throw new Error(`Raising the load_changed_post_acceptance exception failed: ${exceptionError.message}`);
  }
}
