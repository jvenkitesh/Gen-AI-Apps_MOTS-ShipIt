import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { stateFromZip } from "@/lib/estimate/usStates";
import { evaluateAgainstPolicy, type EligibilityResult, type SourcingPolicy } from "@/lib/freight/policyEngine";

const EXCEPTION_SLA_HOURS = 4;
// Exceptions raised automatically about a load's terms; a newer version makes them stale.
const SUPERSEDABLE_TRIGGERS = ["policy_ineligible", "no_active_policy", "no_candidates"];

// Payload a TMS sends to POST /api/loads/webhook.
export const tmsLoadPayloadSchema = z
  .object({
    external_id: z.string().trim().min(1).max(100),
    customer_id: z.string().uuid(),
    origin_zipcode: z.string().regex(/^\d{5}$/, "origin_zipcode must be a 5-digit zip"),
    destination_zipcode: z.string().regex(/^\d{5}$/, "destination_zipcode must be a 5-digit zip"),
    equipment_type: z.enum(["dry_van", "reefer"]),
    scheduled_pickup_at: z.string().datetime({ offset: true }),
    scheduled_delivery_at: z.string().datetime({ offset: true }),
    commodity: z.string().trim().min(1).max(200),
    weight_pounds: z.number().positive(),
    target_rate_dollars: z.number().positive(),
    rate_ceiling_dollars: z.number().positive(),
  })
  .refine((p) => new Date(p.scheduled_delivery_at) >= new Date(p.scheduled_pickup_at), {
    message: "scheduled_delivery_at must be on or after scheduled_pickup_at",
    path: ["scheduled_delivery_at"],
  })
  .refine((p) => p.rate_ceiling_dollars >= p.target_rate_dollars, {
    message: "rate_ceiling_dollars must be at least target_rate_dollars",
    path: ["rate_ceiling_dollars"],
  });

export type TmsLoadPayload = z.infer<typeof tmsLoadPayloadSchema>;

export type IngestOutcome = {
  loadId: string;
  version: number;
  outcome: "created" | "new_version" | "unchanged";
  status: "sourcing" | "exception";
  eligibility: EligibilityResult;
};

export class UnknownCustomerError extends Error {}

// C1 + C2: store the load (new row or new version) and check it against the customer's
// active sourcing policy. All writes use the service role client.
export async function ingestLoad(admin: SupabaseClient, payload: TmsLoadPayload): Promise<IngestOutcome> {
  const { data: customer, error: customerError } = await admin
    .schema("master_data_management")
    .from("customers")
    .select("id")
    .eq("id", payload.customer_id)
    .maybeSingle();
  if (customerError) throw new Error(`Customer lookup failed: ${customerError.message}`);
  if (!customer) throw new UnknownCustomerError(`No customer with id ${payload.customer_id}`);

  const originState = stateFromZip(payload.origin_zipcode);
  const destinationState = stateFromZip(payload.destination_zipcode);

  const { data: ingested, error: ingestError } = await admin
    .schema("transportation_shipment")
    .rpc("ingest_load", {
      payload: { ...payload, origin_state_code: originState, destination_state_code: destinationState },
    })
    .single<{ load_id: string; load_version: number; outcome: IngestOutcome["outcome"] }>();
  if (ingestError || !ingested) throw new Error(`Load intake failed: ${ingestError?.message ?? "no result"}`);

  const { data: policy, error: policyError } = await admin
    .schema("operational_excellence_governance")
    .from("sourcing_policies")
    .select("id, version, eligible_lanes, eligible_equipment, rate_bounds")
    .eq("customer_id", payload.customer_id)
    .eq("status", "active")
    .maybeSingle<SourcingPolicy>();
  if (policyError) throw new Error(`Policy lookup failed: ${policyError.message}`);

  const eligibility = evaluateAgainstPolicy(
    {
      origin_state_code: originState,
      destination_state_code: destinationState,
      equipment_type: payload.equipment_type,
      target_rate_dollars: payload.target_rate_dollars,
      rate_ceiling_dollars: payload.rate_ceiling_dollars,
    },
    policy
  );
  const status = eligibility.eligible ? "sourcing" : "exception";

  const { error: updateError } = await admin
    .schema("transportation_shipment")
    .from("loads")
    .update({
      status,
      evaluated_policy_id: policy?.id ?? null,
      evaluated_policy_version: policy?.version ?? null,
      eligibility_reason_codes: eligibility.reasonCodes,
      evaluated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", ingested.load_id);
  if (updateError) throw new Error(`Saving the policy check failed: ${updateError.message}`);

  // A new version replaces the old terms, so automatic exceptions raised for older versions
  // no longer describe the load. Close them; the new version gets its own check below.
  if (ingested.outcome === "new_version") {
    const { error: supersedeError } = await admin
      .schema("operational_excellence_governance")
      .from("operational_exceptions")
      .update({ status: "resolved", resolution: `Superseded by load version ${ingested.load_version}.` })
      .eq("load_id", ingested.load_id)
      .eq("status", "open")
      .lt("load_version", ingested.load_version)
      .in("trigger_type", SUPERSEDABLE_TRIGGERS);
    if (supersedeError) throw new Error(`Closing superseded exceptions failed: ${supersedeError.message}`);
  }

  if (!eligibility.eligible && ingested.outcome !== "unchanged") {
    const { error: exceptionError } = await admin
      .schema("operational_excellence_governance")
      .from("operational_exceptions")
      .insert({
        load_id: ingested.load_id,
        load_version: ingested.load_version,
        trigger_type: policy ? "policy_ineligible" : "no_active_policy",
        details: { reason_codes: eligibility.reasonCodes, policy_id: policy?.id ?? null, policy_version: policy?.version ?? null },
        recommended_action: policy
          ? "Review the load against the customer's sourcing policy, then adjust the load in the TMS or update the policy."
          : "Create and activate a sourcing policy for this customer.",
        risk_level: "medium",
        sla_deadline: new Date(Date.now() + EXCEPTION_SLA_HOURS * 60 * 60 * 1000).toISOString(),
      });
    if (exceptionError) throw new Error(`Raising the exception failed: ${exceptionError.message}`);
  }

  return { loadId: ingested.load_id, version: ingested.load_version, outcome: ingested.outcome, status, eligibility };
}
