import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api } from "../helpers/api";
import { deleteE2ELoads, loadPayload, postLoadWebhook, type LoadPayload } from "../helpers/fixtures";
import { createAdminClient } from "../helpers/supabaseAdmin";
import { cookieHeader, roleUser } from "../helpers/testUser";

// Priority: P0 -- regression for a Stage 5 finding. Intake stores the load, then saves the
// Policy engine result in a second write. If that second write fails, the load is left in
// "sourcing" without ever being checked. Ranking and outreach must refuse it (fail closed),
// and a TMS retry of the same webhook must check it and unblock it.
describe("loads-unevaluated-fail-closed", () => {
  const admin = createAdminClient();
  let payload: LoadPayload;
  let loadId: string;
  let planner: string;

  beforeAll(async () => {
    planner = await cookieHeader(await roleUser("transportation_planner"));
    payload = await loadPayload({ destination_zipcode: "90012" });
    // The state a failed policy save leaves behind: stored, sourcing, never evaluated.
    const { data, error } = await admin
      .schema("transportation_shipment")
      .from("loads")
      .insert({ ...payload, origin_state_code: "TN", destination_state_code: "CA" })
      .select("id, status, evaluated_at")
      .single();
    if (error || !data) throw new Error(`Inserting the unevaluated load failed: ${error?.message}`);
    expect(data).toMatchObject({ status: "sourcing", evaluated_at: null });
    loadId = data.id as string;
  });

  afterAll(async () => {
    if (loadId) await deleteE2ELoads([loadId]);
  });

  it("refuses to rank carriers for a load the Policy engine never checked", async () => {
    const res = await api(`/api/loads/${loadId}/candidates`, { cookie: planner });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "LOAD_NOT_ELIGIBLE" });
  });

  it("refuses to contact carriers for it, and contacts nobody", async () => {
    const res = await api(`/api/loads/${loadId}/outreach`, { body: { batchSize: 1 }, cookie: planner });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: "NOT_EVALUATED" });
    const { data } = await admin.schema("transportation_shipment").from("carrier_interactions").select("id").eq("load_id", loadId);
    expect(data).toEqual([]);
  });

  it("checks and unblocks the load when the TMS retries the same webhook", async () => {
    const retry = await postLoadWebhook(payload);
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({ load_id: loadId, outcome: "unchanged", status: "sourcing", eligible: true });

    const res = await api<{ candidates: unknown[] }>(`/api/loads/${loadId}/candidates`, { cookie: planner });
    expect(res.status).toBe(200);
    expect(res.body.candidates.length).toBeGreaterThan(0);
  });
});
