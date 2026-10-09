import { randomUUID } from "node:crypto";
import { api } from "./api";
import { createAdminClient } from "./supabaseAdmin";

export const E2E_CUSTOMER_NAME = "E2E Test Customer (automated tests)";
export const E2E_LOAD_PREFIX = "E2E-";

// The dedicated test customer's active sourcing policy. Planners may approve offers up to
// $800; the rate ceiling of the default test load is $1,200.
const E2E_POLICY = {
  eligible_lanes: [{ origin_state: "TN", destination_state: "*" }],
  eligible_equipment: ["dry_van", "reefer"],
  rate_bounds: { minimum_dollars: 100, maximum_dollars: 10000 },
  carrier_tiers: ["preferred", "approved"],
  approval_thresholds: { approval_required_above_dollars: 800 },
};

let customerPromise: Promise<string> | null = null;

/** The one permanent test customer, created with its active policy on first use. */
export function e2eCustomerId(): Promise<string> {
  customerPromise ??= (async () => {
    const admin = createAdminClient();
    const { data: existing, error } = await admin
      .schema("master_data_management")
      .from("customers")
      .select("id")
      .eq("name", E2E_CUSTOMER_NAME)
      .maybeSingle();
    if (error) throw new Error(`Finding the E2E customer failed: ${error.message}`);
    let id = existing?.id as string | undefined;
    if (!id) {
      const created = await admin.schema("master_data_management").from("customers").insert({ name: E2E_CUSTOMER_NAME }).select("id").single();
      if (created.error) throw new Error(`Creating the E2E customer failed: ${created.error.message}`);
      id = created.data.id as string;
    }
    const { data: policy } = await admin
      .schema("operational_excellence_governance")
      .from("sourcing_policies")
      .select("id")
      .eq("customer_id", id)
      .eq("status", "active")
      .maybeSingle();
    if (!policy) {
      const inserted = await admin
        .schema("operational_excellence_governance")
        .from("sourcing_policies")
        .insert({ customer_id: id, version: 1, status: "active", ...E2E_POLICY, outreach_disclosure_text: "Automated test message from MOTS ShipIt. Reply STOP to opt out." });
      if (inserted.error) throw new Error(`Creating the E2E policy failed: ${inserted.error.message}`);
    }
    return id;
  })();
  return customerPromise;
}

export type LoadPayload = {
  external_id: string;
  customer_id: string;
  origin_zipcode: string;
  destination_zipcode: string;
  equipment_type: "dry_van" | "reefer";
  scheduled_pickup_at: string;
  scheduled_delivery_at: string;
  commodity: string;
  weight_pounds: number;
  target_rate_dollars: number;
  rate_ceiling_dollars: number;
};

/** Memphis, TN (38103) to Atlanta, GA (30303), dry van, target $900, ceiling $1,200. */
export async function loadPayload(overrides: Partial<LoadPayload> = {}): Promise<LoadPayload> {
  const day = 24 * 60 * 60 * 1000;
  return {
    external_id: `${E2E_LOAD_PREFIX}${Date.now()}-${randomUUID().slice(0, 4)}`,
    customer_id: await e2eCustomerId(),
    origin_zipcode: "38103",
    destination_zipcode: "30303",
    equipment_type: "dry_van",
    scheduled_pickup_at: new Date(Date.now() + day).toISOString(),
    scheduled_delivery_at: new Date(Date.now() + 2 * day).toISOString(),
    commodity: "E2E automated test freight",
    weight_pounds: 20000,
    target_rate_dollars: 900,
    rate_ceiling_dollars: 1200,
    ...overrides,
  };
}

export type WebhookResult = {
  load_id: string;
  version: number;
  outcome: "created" | "new_version" | "unchanged";
  status: "sourcing" | "exception";
  eligible: boolean;
  reason_codes: string[];
  error?: string;
  field?: string | null;
};

export function postLoadWebhook(payload: unknown, secret: string | null = process.env.TMS_WEBHOOK_SECRET ?? null) {
  return api<WebhookResult>("/api/loads/webhook", {
    body: payload,
    headers: secret === null ? {} : { "x-tms-webhook-secret": secret },
  });
}

/** Creates an E2E load through the real TMS webhook and returns its id. */
export async function createE2ELoad(overrides: Partial<LoadPayload> = {}): Promise<{ id: string; payload: LoadPayload; result: WebhookResult }> {
  const payload = await loadPayload(overrides);
  const res = await postLoadWebhook(payload);
  if (res.status !== 201) throw new Error(`Creating the E2E load failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { id: res.body.load_id, payload, result: res.body };
}

/** Deletes E2E loads (offers, outreach and exceptions cascade). A booked load can't be
 *  deleted, by design; it stays, labelled E2E-, with its permanent audit trail. */
export async function deleteE2ELoads(loadIds: string[]): Promise<void> {
  const admin = createAdminClient();
  for (const id of loadIds) {
    const { data: booking } = await admin.schema("transportation_shipment").from("carrier_bookings").select("id").eq("load_id", id).limit(1);
    if (booking && booking.length > 0) continue;
    const { error } = await admin.schema("transportation_shipment").from("loads").delete().eq("id", id).like("external_id", `${E2E_LOAD_PREFIX}%`);
    if (error) throw new Error(`Deleting E2E load ${id} failed: ${error.message}`);
  }
}
