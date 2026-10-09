import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api } from "../helpers/api";
import { createE2ELoad, deleteE2ELoads, loadPayload, postLoadWebhook } from "../helpers/fixtures";
import { createAdminClient } from "../helpers/supabaseAdmin";
import { cookieHeader, roleUser } from "../helpers/testUser";

type Exception = { id: string; load_id: string; trigger_type: string; status: string; risk_level: string; sla_deadline: string; resolution: string | null };

// Priority: P0 -- C8: problems reach a person with a deadline, are never silently dropped,
// and are resolved or escalated with a note.
describe("exceptions-queue", () => {
  const admin = createAdminClient();
  let loadId: string;
  let exception: Exception;
  let planner: string;
  let viewer: string;
  const loadIds: string[] = [];

  beforeAll(async () => {
    [planner, viewer] = await Promise.all([
      roleUser("transportation_planner").then(cookieHeader),
      roleUser("viewer").then(cookieHeader),
    ]);
  });

  afterAll(async () => {
    await deleteE2ELoads(loadIds);
  });

  it("raises a policy exception with a 4-hour SLA for a load on a lane the policy doesn't allow", async () => {
    // Georgia to Tennessee: the E2E policy only allows loads that start in Tennessee.
    const res = await postLoadWebhook(await loadPayload({ origin_zipcode: "30303", destination_zipcode: "38103" }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "exception", eligible: false, reason_codes: ["LANE_NOT_ELIGIBLE"] });
    loadId = res.body.load_id;
    loadIds.push(loadId);

    const queue = await api<{ items: Exception[] }>("/api/exceptions", { cookie: viewer });
    expect(queue.status).toBe(200);
    exception = queue.body.items.find((e) => e.load_id === loadId)!;
    expect(exception).toMatchObject({ trigger_type: "policy_ineligible", status: "open", risk_level: "medium" });
    const hoursLeft = (new Date(exception.sla_deadline).getTime() - Date.now()) / 3_600_000;
    expect(hoursLeft).toBeGreaterThan(3.9);
    expect(hoursLeft).toBeLessThanOrEqual(4);
  });

  it("lists the queue soonest deadline first", async () => {
    const queue = await api<{ items: Exception[] }>("/api/exceptions", { cookie: viewer });
    const deadlines = queue.body.items.map((e) => e.sla_deadline).filter(Boolean);
    expect(deadlines).toEqual([...deadlines].sort());
  });

  it("marks an exception past its deadline as breached, and keeps it in the queue", async () => {
    const other = await createE2ELoad();
    loadIds.push(other.id);
    const { data: overdue, error } = await admin
      .schema("operational_excellence_governance")
      .from("operational_exceptions")
      .insert({
        load_id: other.id,
        load_version: 1,
        trigger_type: "no_candidates",
        details: { e2e: true },
        recommended_action: "E2E: overdue exception",
        risk_level: "high",
        sla_deadline: new Date(Date.now() - 60_000).toISOString(),
      })
      .select("id")
      .single();
    expect(error).toBeNull();

    const queue = await api<{ items: Exception[] }>("/api/exceptions", { cookie: viewer });
    expect(queue.body.items.find((e) => e.id === overdue!.id)?.status).toBe("breached");
  });

  it("requires a real note to resolve", async () => {
    const res = await api(`/api/exceptions/${exception.id}/resolve`, { body: { action: "resolve", resolution: "ok" }, cookie: planner });
    expect(res.status).toBe(422);
  });

  it("escalates: stays open, becomes critical, keeps the note", async () => {
    const res = await api<{ exception: Exception }>(`/api/exceptions/${exception.id}/resolve`, {
      body: { action: "escalate", resolution: "Customer must approve the GA origin" },
      cookie: planner,
    });
    expect(res.status).toBe(200);
    expect(res.body.exception).toMatchObject({ status: "open", risk_level: "critical", resolution: "Escalated: Customer must approve the GA origin" });
  });

  it("resolves once; a second resolve answers 409 NOT_OPEN", async () => {
    const first = await api<{ exception: Exception }>(`/api/exceptions/${exception.id}/resolve`, {
      body: { action: "resolve", resolution: "E2E: load corrected in the TMS" },
      cookie: planner,
    });
    expect(first.status).toBe(200);
    expect(first.body.exception.status).toBe("resolved");

    const second = await api(`/api/exceptions/${exception.id}/resolve`, { body: { action: "resolve", resolution: "E2E: again" }, cookie: planner });
    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({ error: "NOT_OPEN" });

    const resolved = await api<{ items: Exception[] }>("/api/exceptions?status=resolved", { cookie: viewer });
    expect(resolved.body.items.some((e) => e.id === exception.id)).toBe(true);
  });
});
