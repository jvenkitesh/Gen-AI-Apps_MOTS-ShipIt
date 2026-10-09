import { describe, expect, it } from "vitest";
import { describeEvent, type AuditEventRow } from "@/lib/freight/audit";

const event = (entity_type: string, event_type: string, payload: AuditEventRow["payload"] = {}, extra: Partial<AuditEventRow> = {}): AuditEventRow => ({
  id: 1,
  occurred_at: "2026-10-08T12:00:00Z",
  entity_type,
  entity_id: "id-1",
  load_id: "load-1",
  event_type,
  actor_id: null,
  payload,
  model_version: null,
  policy_version: null,
  ...extra,
});

describe("audit log: describeEvent", () => {
  it.each([
    [event("load", "created", { new: { version: 1 } }), "Load received from the TMS (version 1)."],
    [event("load", "version_incremented", { old: { version: 1 }, new: { version: 2 } }), "Load changed: version 1 → 2."],
    [event("load", "status_changed", { old: { status: "sourcing" }, new: { status: "booked" } }), "Load status: sourcing → booked."],
    [event("offer", "proposed", { new: { rate_dollars: 1050 } }), "Offer recorded: $1050.00."],
    [event("offer", "blocked", { new: { rate_dollars: 1500 } }), "Offer blocked (above ceiling): $1500.00."],
    [event("offer", "rejected", { new: {} }), "Offer rejected."],
    [event("offer", "extracted", {}, { model_version: "gpt-4o-mini" }), "Carrier reply read by gpt-4o-mini."],
    [event("booking", "committed", { new: { rate_dollars: 1050 } }), "Booking committed: $1050.00."],
    [event("booking", "tms_sync_succeeded", { new: { tms_external_reference: "TMS-1" } }), "Booking written to the TMS (ref TMS-1)."],
    [event("booking", "tms_sync_failed", { new: {} }), "TMS write-back failed: unknown error."],
    [event("compliance_check", "stale_blocked_booking"), "Booking blocked: no fresh compliance check."],
    [event("control_action", "pause", { new: { scope: "load", scope_id: "L1", reason: "Check rate" } }), "Control plane pause: load L1 — Check rate"],
  ])("describes %#", (e, text) => {
    expect(describeEvent(e)).toBe(text);
  });

  it("falls back to entity and event names for anything new", () => {
    expect(describeEvent(event("carrier", "renamed"))).toBe("carrier renamed");
  });
});
