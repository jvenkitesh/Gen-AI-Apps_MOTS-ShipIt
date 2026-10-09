import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api } from "../helpers/api";
import { createE2ELoad, deleteE2ELoads } from "../helpers/fixtures";
import { cookieHeader, roleUser } from "../helpers/testUser";

type Pause = { scope: string; scope_id: string | null; reason: string };

// Priority: P0 -- C8: a pause stops automation in the write path, and resume restarts it.
// Pauses only this test's own load, so nothing else in the dev project is affected.
describe("control-pause-blocks-outreach", () => {
  let loadId: string;
  let manager: string;
  let planner: string;
  let paused = false;

  const control = (action: "pause" | "resume", reason: string) =>
    api<{ controlAction: { action: string; scope_id: string } }>("/api/control", {
      body: { scope: "load", scopeId: loadId, action, reason },
      cookie: manager,
    });

  beforeAll(async () => {
    [manager, planner] = await Promise.all([
      roleUser("supply_chain_operations_manager").then(cookieHeader),
      roleUser("transportation_planner").then(cookieHeader),
    ]);
    loadId = (await createE2ELoad()).id;
  });

  afterAll(async () => {
    if (paused) await control("resume", "E2E cleanup after a failed test");
    if (loadId) await deleteE2ELoads([loadId]);
  });

  it.each([
    ["global with a target", { scope: "global", scopeId: "x", action: "pause", reason: "E2E validation" }],
    ["a load with no target", { scope: "load", action: "pause", reason: "E2E validation" }],
    ["a reason that is too short", { scope: "global", action: "pause", reason: "no" }],
    ["an unknown action", { scope: "global", action: "delete", reason: "E2E validation" }],
  ])("rejects %s with 400", async (_name, body) => {
    const res = await api("/api/control", { body, cookie: manager });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "VALIDATION_ERROR" });
  });

  it("pauses one load and shows it as an active pause", async () => {
    const res = await control("pause", "E2E pause test");
    expect(res.status).toBe(201);
    paused = true;
    expect(res.body.controlAction).toMatchObject({ action: "pause", scope_id: loadId });

    const state = await api<{ activePauses: Pause[] }>("/api/control", { cookie: planner });
    expect(state.status).toBe(200);
    expect(state.body.activePauses).toContainEqual(expect.objectContaining({ scope: "load", scope_id: loadId, reason: "E2E pause test" }));
  });

  it("blocks outreach on the paused load with 409 PAUSED, naming the reason", async () => {
    const res = await api<{ error: string; message: string }>(`/api/loads/${loadId}/outreach`, { body: { batchSize: 1 }, cookie: planner });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("PAUSED");
    expect(res.body.message).toContain("E2E pause test");
  });

  it("lets outreach run again after a resume", async () => {
    expect((await control("resume", "E2E resume test")).status).toBe(201);
    paused = false;
    const res = await api<{ contacted: unknown[] }>(`/api/loads/${loadId}/outreach`, { body: { batchSize: 1 }, cookie: planner });
    expect(res.status).toBe(200);
    expect(res.body.contacted).toHaveLength(1);
  });
});
