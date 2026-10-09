import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../helpers/api";
import { cookieHeader, roleUser } from "../helpers/testUser";

const anyId = randomUUID();

// Priority: P0 -- no data or action without a session, and each role only does its own job.
describe("auth-roles-and-protected-routes", () => {
  it.each([
    ["GET", "/api/loads"],
    ["GET", `/api/loads/${anyId}/candidates`],
    ["POST", `/api/loads/${anyId}/outreach`],
    ["POST", `/api/loads/${anyId}/replies`],
    ["POST", `/api/loads/${anyId}/book`],
    ["POST", `/api/offers/${anyId}/respond`],
    ["GET", `/api/carriers/${anyId}/compliance`],
    ["GET", "/api/exceptions"],
    ["POST", `/api/exceptions/${anyId}/resolve`],
    ["GET", "/api/control"],
    ["POST", "/api/control"],
    ["POST", "/api/estimate"],
    ["POST", `/api/bookings/${anyId}/sync`],
  ])("%s %s without a session answers 401", async (method, path) => {
    const res = await api(path, { method, body: method === "POST" ? {} : undefined });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "UNAUTHENTICATED" });
  });

  describe("role checks", () => {
    let viewer: string;
    let planner: string;
    let analyst: string;

    beforeAll(async () => {
      [viewer, planner, analyst] = await Promise.all([
        roleUser("viewer").then(cookieHeader),
        roleUser("transportation_planner").then(cookieHeader),
        roleUser("compliance_analyst").then(cookieHeader),
      ]);
    });

    it.each([
      ["viewer contacts carriers", () => viewer, `/api/loads/${anyId}/outreach`, { batchSize: 1 }],
      ["viewer books a load", () => viewer, `/api/loads/${anyId}/book`, { offerId: anyId, idempotencyKey: "e2e-forbidden" }],
      ["compliance analyst pastes a carrier reply", () => analyst, `/api/loads/${anyId}/replies`, { carrierId: anyId, replyText: "$1000" }],
      ["planner pauses the control plane", () => planner, "/api/control", { scope: "global", action: "pause", reason: "not allowed" }],
      ["planner retries a TMS sync", () => planner, `/api/bookings/${anyId}/sync`, {}],
      ["planner records a compliance check", () => planner, `/api/carriers/${anyId}/compliance`, { result: "pass", authorityActive: true, insuranceValid: true, note: "not allowed" }],
      ["viewer resolves an exception", () => viewer, `/api/exceptions/${anyId}/resolve`, { action: "resolve", resolution: "not allowed" }],
    ])("403 when a %s", async (_name, cookie, path, body) => {
      const res = await api(path, { body, cookie: cookie() });
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error: "FORBIDDEN" });
    });

    it("lets every signed-in role read loads", async () => {
      const res = await api<{ items: unknown[] }>("/api/loads", { cookie: viewer });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
    });
  });
});
