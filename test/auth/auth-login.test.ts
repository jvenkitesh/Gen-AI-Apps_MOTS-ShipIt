import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, fakeClientIp } from "../helpers/api";
import { createEphemeralUser, deleteEphemeralUser, type TestUser } from "../helpers/testUser";

// Priority: P0 -- every protected route depends on login working.
describe("auth-login", () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createEphemeralUser("login");
  });

  afterAll(async () => {
    await deleteEphemeralUser(user.id);
  });

  it("logs in a confirmed user and sets the Supabase session cookie", async () => {
    const res = await api("/api/auth/login", { body: { email: user.email, password: user.password }, headers: fakeClientIp() });
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().some((c) => c.startsWith("sb-"))).toBe(true);
  });

  it("accepts the email in any case and with spaces around it", async () => {
    const res = await api("/api/auth/login", { body: { email: `  ${user.email.toUpperCase()} `, password: user.password }, headers: fakeClientIp() });
    expect(res.status).toBe(200);
  });

  it("gives the same generic 401 for a wrong password and an unknown account", async () => {
    const wrong = await api("/api/auth/login", { body: { email: user.email, password: "Wrong-password-1" }, headers: fakeClientIp() });
    const unknown = await api("/api/auth/login", { body: { email: "nobody.e2e@example.com", password: "Wrong-password-1" }, headers: fakeClientIp() });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual({ error: "INVALID_CREDENTIALS", message: "Email or password is incorrect." });
    expect(unknown.body).toEqual(wrong.body);
  });

  it("rejects a malformed request with 422", async () => {
    const res = await api("/api/auth/login", { body: { email: "not-an-email" }, headers: fakeClientIp() });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: "VALIDATION_ERROR" });
  });

  it("logout clears the session", async () => {
    const login = await api("/api/auth/login", { body: { email: user.email, password: user.password }, headers: fakeClientIp() });
    const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const out = await api("/api/auth/logout", { method: "POST", cookie });
    expect(out.status).toBeLessThan(400);
    expect(out.headers.getSetCookie().some((c) => /^sb-[^=]+=;|Max-Age=0/i.test(c))).toBe(true);
  });
});
