import { describe, expect, it, vi } from "vitest";
import { buildMessage, outreachSettings } from "@/lib/freight/outreach";
import type { LoadRow } from "@/lib/freight/loadQueries";

const load: LoadRow = {
  id: "load-1",
  external_id: "E2E-123",
  version: 1,
  customer_id: "customer-1",
  origin_zipcode: "38103",
  destination_zipcode: "30303",
  origin_state_code: "TN",
  destination_state_code: "GA",
  equipment_type: "reefer",
  scheduled_pickup_at: "2026-10-09T14:30:00.000Z",
  scheduled_delivery_at: "2026-10-10T18:00:00.000Z",
  commodity: "Frozen peas",
  weight_pounds: 20000,
  target_rate_dollars: 987.65,
  rate_ceiling_dollars: 1234.56,
  status: "sourcing",
  evaluated_policy_id: "policy-1",
  evaluated_policy_version: 1,
  eligibility_reason_codes: [],
  evaluated_at: null,
  created_at: "2026-10-08T12:00:00.000Z",
};

describe("outreach: buildMessage", () => {
  const message = buildMessage(load, "Automated message. Reply STOP to opt out.");

  it("starts with the disclosure and states the load facts", () => {
    expect(message.subject).toBe("Load E2E-123: TN 38103 to GA 30303, Reefer");
    expect(message.body.split("\n")[0]).toBe("Automated message. Reply STOP to opt out.");
    expect(message.body).toContain("Lane: TN 38103 to GA 30303");
    expect(message.body).toContain("Weight: 20,000 lb");
    expect(message.body).toContain("Commodity: Frozen peas");
  });

  it("gives times in UTC, not the server's time zone", () => {
    expect(message.body).toContain("Pickup: Oct 9, 2026, 2:30 PM UTC");
    expect(message.body).toContain("Delivery: Oct 10, 2026, 6:00 PM UTC");
  });

  it("never shares the target rate or the rate ceiling with carriers", () => {
    const text = `${message.subject}\n${message.body}`;
    for (const secret of ["987", "1,234", "1234"]) expect(text).not.toContain(secret);
  });
});

describe("outreach: outreachSettings", () => {
  it("is test mode unless OUTREACH_MODE is exactly 'live'", () => {
    vi.stubEnv("OUTREACH_MODE", "");
    expect(outreachSettings().mode).toBe("test");
    vi.stubEnv("OUTREACH_MODE", "LIVE");
    expect(outreachSettings().mode).toBe("test");
    vi.stubEnv("OUTREACH_MODE", "live");
    expect(outreachSettings().mode).toBe("live");
  });

  it("falls back to safe limits for missing or invalid numbers", () => {
    vi.stubEnv("OUTREACH_MAX_MESSAGES_PER_CONTACT_PER_DAY", "-2");
    vi.stubEnv("OUTREACH_BATCH_WAIT_MINUTES", "abc");
    expect(outreachSettings()).toMatchObject({ maxMessagesPerContactPerDay: 3, batchWaitMinutes: 30 });
  });
});
