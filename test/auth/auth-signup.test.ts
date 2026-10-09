import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api, fakeClientIp } from "../helpers/api";
import { createAdminClient } from "../helpers/supabaseAdmin";

// Priority: P0 -- sign-up is limited to approved company email addresses.
describe("auth-signup", () => {
  it("rejects a malformed sign-up with 422 and a plain message", async () => {
    const res = await api("/api/auth/signup", {
      body: { fullName: "E2E Test", email: "e2e@example.com", password: "short" },
      headers: fakeClientIp(),
    });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: "VALIDATION_ERROR", message: "Password must be at least 8 characters." });
  });

  it("refuses an address that isn't on the allow-list, and creates no account", async () => {
    const email = `mots-shipit.e2e.not-allowed.${randomUUID().slice(0, 8)}@example.com`;
    const res = await api("/api/auth/signup", {
      body: { fullName: "E2E Not Allowed", email, password: "Long-enough-1" },
      headers: fakeClientIp(),
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "SIGNUP_NOT_ALLOWED", message: "Sign-up is limited to approved company email addresses." });

    const { data } = await createAdminClient().schema("data_foundation").from("user_profiles").select("id").eq("email", email);
    expect(data).toEqual([]);
  });
});
