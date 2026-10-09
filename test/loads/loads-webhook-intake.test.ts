import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api } from "../helpers/api";
import { deleteE2ELoads, loadPayload, postLoadWebhook, type LoadPayload } from "../helpers/fixtures";
import { createAdminClient } from "../helpers/supabaseAdmin";
import { cookieHeader, roleUser } from "../helpers/testUser";

// Priority: P0 -- C1 load intake + C2 Policy engine through the real TMS webhook.
describe("loads-webhook-intake", () => {
  let payload: LoadPayload;
  let loadId: string;

  beforeAll(async () => {
    payload = await loadPayload();
  });

  afterAll(async () => {
    if (loadId) await deleteE2ELoads([loadId]);
  });

  it("rejects a missing or wrong webhook secret with 401", async () => {
    expect((await postLoadWebhook(payload, null)).status).toBe(401);
    const wrong = await postLoadWebhook(payload, "not-the-secret");
    expect(wrong.status).toBe(401);
    expect(wrong.body).toMatchObject({ error: "UNAUTHORIZED" });
  });

  it("names the bad field in a 422", async () => {
    const res = await postLoadWebhook({ ...payload, origin_zipcode: "3810" });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: "VALIDATION_ERROR", field: "origin_zipcode" });
  });

  it("rejects an unknown customer with 422", async () => {
    const res = await postLoadWebhook({ ...payload, customer_id: randomUUID() });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: "UNKNOWN_CUSTOMER", field: "customer_id" });
  });

  it("creates a new load that passes the Policy engine (201, sourcing)", async () => {
    const res = await postLoadWebhook(payload);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ version: 1, outcome: "created", status: "sourcing", eligible: true, reason_codes: [] });
    loadId = res.body.load_id;
  });

  it("treats a repeat of the same load as unchanged", async () => {
    const res = await postLoadWebhook(payload);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ load_id: loadId, version: 1, outcome: "unchanged" });
  });

  it("makes a new version when the TMS changes the terms", async () => {
    const res = await postLoadWebhook({ ...payload, weight_pounds: 22000 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ load_id: loadId, version: 2, outcome: "new_version", status: "sourcing" });
  });

  it("moves a load that breaks the policy to exception and raises one", async () => {
    const res = await postLoadWebhook({ ...payload, weight_pounds: 22000, rate_ceiling_dollars: 20000 });
    expect(res.body).toMatchObject({ version: 3, status: "exception", eligible: false, reason_codes: ["RATE_CEILING_ABOVE_MAXIMUM"] });

    const { data } = await createAdminClient()
      .schema("operational_excellence_governance")
      .from("operational_exceptions")
      .select("trigger_type, status, load_version, risk_level")
      .eq("load_id", loadId);
    expect(data).toEqual([{ trigger_type: "policy_ineligible", status: "open", load_version: 3, risk_level: "medium" }]);
  });

  it("closes the stale exception when a corrected version arrives", async () => {
    const res = await postLoadWebhook({ ...payload, weight_pounds: 22000, rate_ceiling_dollars: 1300 });
    expect(res.body).toMatchObject({ version: 4, status: "sourcing", eligible: true });

    const { data } = await createAdminClient()
      .schema("operational_excellence_governance")
      .from("operational_exceptions")
      .select("status, resolution")
      .eq("load_id", loadId);
    expect(data).toEqual([{ status: "resolved", resolution: "Superseded by load version 4." }]);
  });

  it("shows the latest version to signed-in users", async () => {
    const viewer = await cookieHeader(await roleUser("viewer"));
    const res = await api<{ items: Array<{ id: string; version: number; external_id: string }> }>("/api/loads", { cookie: viewer });
    expect(res.status).toBe(200);
    expect(res.body.items.find((l) => l.id === loadId)).toMatchObject({ version: 4, external_id: payload.external_id });
  });
});
