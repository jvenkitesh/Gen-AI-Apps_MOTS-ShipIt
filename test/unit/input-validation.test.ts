import { describe, expect, it } from "vitest";
import { firstIssueMessage, loginSchema, resetPasswordSchema, signupSchema } from "@/lib/security/inputValidator";
import { tmsLoadPayloadSchema } from "@/lib/freight/loadIntake";

const validLoad = {
  external_id: "E2E-1",
  customer_id: "6e3578d6-3033-4257-b120-b1dbb20a6212",
  origin_zipcode: "38103",
  destination_zipcode: "30303",
  equipment_type: "dry_van",
  scheduled_pickup_at: "2026-10-09T14:00:00Z",
  scheduled_delivery_at: "2026-10-10T14:00:00Z",
  commodity: "Paper",
  weight_pounds: 20000,
  target_rate_dollars: 900,
  rate_ceiling_dollars: 1200,
};

const issue = (result: { success: boolean; error?: Parameters<typeof firstIssueMessage>[0] }) =>
  result.success ? null : firstIssueMessage(result.error!);

describe("auth input validation", () => {
  it("trims and lowercases the email", () => {
    const parsed = signupSchema.parse({ fullName: "  Pat Lee ", email: "  Pat.Lee@Example.COM ", password: "longenough" });
    expect(parsed).toEqual({ fullName: "Pat Lee", email: "pat.lee@example.com", password: "longenough" });
  });

  it("explains each rejection in plain words", () => {
    expect(issue(signupSchema.safeParse({ fullName: "Pat", email: "not-an-email", password: "longenough" }))).toBe("Enter a valid email address.");
    expect(issue(signupSchema.safeParse({ fullName: "Pat", email: "a@b.co", password: "short" }))).toBe("Password must be at least 8 characters.");
    expect(issue(signupSchema.safeParse({ fullName: "   ", email: "a@b.co", password: "longenough" }))).toBe("Enter your full name.");
    expect(issue(loginSchema.safeParse({ email: "a@b.co", password: "" }))).toBe("Enter your password.");
  });

  it("caps passwords at 72 characters rather than letting bcrypt silently truncate", () => {
    expect(resetPasswordSchema.safeParse({ password: "x".repeat(72) }).success).toBe(true);
    expect(issue(resetPasswordSchema.safeParse({ password: "x".repeat(73) }))).toBe("Password must be 72 characters or fewer.");
  });
});

describe("load intake: TMS payload validation", () => {
  it("accepts a valid load", () => {
    expect(tmsLoadPayloadSchema.safeParse(validLoad).success).toBe(true);
  });

  it.each([
    ["origin_zipcode", { origin_zipcode: "3810" }],
    ["equipment_type", { equipment_type: "flatbed" }],
    ["customer_id", { customer_id: "not-a-uuid" }],
    ["weight_pounds", { weight_pounds: 0 }],
    ["scheduled_pickup_at", { scheduled_pickup_at: "tomorrow" }],
  ])("rejects a bad %s", (field, change) => {
    const result = tmsLoadPayloadSchema.safeParse({ ...validLoad, ...change });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual([field]);
  });

  it("rejects delivery before pickup and a ceiling below the target", () => {
    const early = tmsLoadPayloadSchema.safeParse({ ...validLoad, scheduled_delivery_at: "2026-10-08T00:00:00Z" });
    expect(early.error?.issues[0]).toMatchObject({ path: ["scheduled_delivery_at"], message: "scheduled_delivery_at must be on or after scheduled_pickup_at" });
    const low = tmsLoadPayloadSchema.safeParse({ ...validLoad, rate_ceiling_dollars: 800 });
    expect(low.error?.issues[0]).toMatchObject({ path: ["rate_ceiling_dollars"] });
  });
});
