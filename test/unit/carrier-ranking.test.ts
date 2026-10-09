import { describe, expect, it } from "vitest";
import { EXCLUSION_REASON_TEXT, rankCarriers, type CarrierRecord, type RoutingGuideLane } from "@/lib/freight/carrierRanking";

const NOW = new Date("2026-10-08T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

const carrier = (overrides: Partial<CarrierRecord> & { id: string; name: string }): CarrierRecord => ({
  tier: "approved",
  status: "active",
  modes: ["FTL"],
  equipment_types: [],
  service_history: {},
  ...overrides,
});

const lane = (carrierName: string, overrides: Partial<RoutingGuideLane> = {}): RoutingGuideLane => ({
  carrier: carrierName,
  origin_hub: "Memphis, TN",
  state_code: "GA",
  mode: "FTL",
  corridor: "I-22",
  transit_days: 2,
  ...overrides,
});

const load = { origin_state_code: "TN", destination_state_code: "GA", equipment_type: "dry_van" as const };

describe("carrier ranking: rankCarriers", () => {
  it("puts every carrier in exactly one list, with a reason", () => {
    const carriers = [
      carrier({ id: "a", name: "Alpha" }),
      carrier({ id: "b", name: "Bravo", status: "inactive" }),
      carrier({ id: "c", name: "Charlie", tier: "blocked" }),
      carrier({ id: "d", name: "Delta", tier: "probationary" }),
      carrier({ id: "e", name: "Echo" }),
      carrier({ id: "f", name: "Foxtrot", equipment_types: ["reefer"] }),
    ];
    const result = rankCarriers({
      load,
      carriers,
      lanes: [lane("Alpha"), lane("Delta"), lane("Foxtrot"), lane("Echo", { state_code: "FL" })],
      allowedTiers: ["preferred", "approved"],
      now: NOW,
    });

    expect(result.candidates.map((c) => c.name)).toEqual(["Alpha"]);
    expect(Object.fromEntries(result.excluded.map((e) => [e.name, e.exclusionReason]))).toEqual({
      Bravo: "carrier_inactive",
      Charlie: "tier_blocked",
      Delta: "tier_not_allowed",
      Echo: "not_in_routing_guide_for_lane",
      Foxtrot: "equipment_mismatch",
    });
    for (const e of result.excluded) expect(EXCLUSION_REASON_TEXT[e.exclusionReason]).toBeTruthy();
  });

  it("excludes everyone when the policy allows no carrier tiers", () => {
    const result = rankCarriers({ load, carriers: [carrier({ id: "a", name: "Alpha" })], lanes: [lane("Alpha")], allowedTiers: [], now: NOW });
    expect(result.candidates).toHaveLength(0);
    expect(result.excluded[0].exclusionReason).toBe("policy_has_no_carrier_tiers");
  });

  it("scores lane, origin hub, tier, equipment and recent bookings, best first", () => {
    const result = rankCarriers({
      load,
      carriers: [
        carrier({ id: "a", name: "Approved-unverified" }),
        carrier({ id: "p", name: "Preferred-full", tier: "preferred", equipment_types: ["dry_van"], service_history: { last_successful_booking_at: daysAgo(10) } }),
        carrier({ id: "s", name: "Approved-some-history", equipment_types: ["dry_van"], service_history: { last_successful_booking_at: daysAgo(60) } }),
      ],
      lanes: [lane("Approved-unverified", { origin_hub: "Dallas, TX" }), lane("Preferred-full"), lane("Approved-some-history")],
      allowedTiers: ["preferred", "approved"],
      now: NOW,
    });

    const [first, second, third] = result.candidates;
    // 0.45 lane + 0.10 hub + 0.25 preferred + 0.10 equipment + 0.10 recent
    expect(first).toMatchObject({ name: "Preferred-full", score: 1 });
    expect(first.reasonCodes).toEqual(["lane_match", "origin_hub_match", "tier_preferred", "equipment_match", "service_history_recent"]);
    // 0.45 + 0.10 + 0.18 + 0.10 + 0.05
    expect(second).toMatchObject({ name: "Approved-some-history", score: 0.88 });
    expect(second.reasonCodes).toContain("service_history_some");
    // 0.45 + 0.18, no hub match, equipment not on file
    expect(third).toMatchObject({ name: "Approved-unverified", score: 0.63 });
    expect(third.reasonCodes).toEqual(["lane_match", "tier_approved", "equipment_unverified"]);
    expect(third.lane).toEqual({ corridor: "I-22", mode: "FTL", transit_days: 2 });
  });

  it("ignores bookings older than 90 days", () => {
    const result = rankCarriers({
      load,
      carriers: [carrier({ id: "a", name: "Alpha", service_history: { last_successful_booking_at: daysAgo(120) } })],
      lanes: [lane("Alpha")],
      allowedTiers: ["approved"],
      now: NOW,
    });
    expect(result.candidates[0].reasonCodes.some((r) => r.startsWith("service_history"))).toBe(false);
  });

  it("breaks score ties by name and counts a repeated carrier once", () => {
    const result = rankCarriers({
      load,
      carriers: [carrier({ id: "z", name: "Zulu" }), carrier({ id: "a", name: "Alpha" }), carrier({ id: "a", name: "Alpha" })],
      lanes: [lane("Zulu"), lane("Alpha")],
      allowedTiers: ["approved"],
      now: NOW,
    });
    expect(result.candidates.map((c) => c.name)).toEqual(["Alpha", "Zulu"]);
  });
});
