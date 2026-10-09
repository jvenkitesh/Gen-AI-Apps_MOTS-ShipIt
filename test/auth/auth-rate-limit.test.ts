import { describe, expect, it } from "vitest";
import { api, fakeClientIp } from "../helpers/api";

// Priority: P1 -- 10 auth attempts per minute per client address (specs/auth-rbac.md).
describe("auth-rate-limit", () => {
  it("allows 10 attempts a minute from one address, then answers 429 with Retry-After", async () => {
    const ip = fakeClientIp();
    const attempt = () => api("/api/auth/login", { body: { email: "nobody.e2e@example.com", password: "Wrong-password-1" }, headers: ip });

    for (let i = 1; i <= 10; i++) {
      expect((await attempt()).status, `attempt ${i}`).toBe(401);
    }
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ error: "RATE_LIMITED" });
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});
