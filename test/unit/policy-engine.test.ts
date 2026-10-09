import { describe, expect, it } from "vitest";
import { evaluateAgainstPolicy, REASON_CODE_TEXT, type LoadForEvaluation, type SourcingPolicy } from "@/lib/freight/policyEngine";

const policy: SourcingPolicy = {
  id: "policy-1",
  version: 3,
  eligible_lanes: [{ origin_state: "TN", destination_state: "*" }, { origin_state: "GA", destination_state: "fl" }],
  eligible_equipment: ["dry_van"],
  rate_bounds: { minimum_dollars: 100, maximum_dollars: 5000 },
};

const load: LoadForEvaluation = {
  origin_state_code: "TN",
  destination_state_code: "GA",
  equipment_type: "dry_van",
  target_rate_dollars: 900,
  rate_ceiling_dollars: 1200,
};

describe("policy engine: evaluateAgainstPolicy", () => {
  it("passes a load that meets every gate", () => {
    expect(evaluateAgainstPolicy(load, policy)).toEqual({ eligible: true, reasonCodes: [] });
  });

  it("fails closed with NO_ACTIVE_POLICY when the customer has no policy", () => {
    expect(evaluateAgainstPolicy(load, null)).toEqual({ eligible: false, reasonCodes: ["NO_ACTIVE_POLICY"] });
  });

  it("treats * as any state and matches state rules case-insensitively", () => {
    expect(evaluateAgainstPolicy({ ...load, destination_state_code: "CA" }, policy).eligible).toBe(true);
    expect(evaluateAgainstPolicy({ ...load, origin_state_code: "GA", destination_state_code: "FL" }, policy).eligible).toBe(true);
  });

  it("rejects a lane that isn't on the policy", () => {
    const result = evaluateAgainstPolicy({ ...load, origin_state_code: "GA", destination_state_code: "TX" }, policy);
    expect(result).toEqual({ eligible: false, reasonCodes: ["LANE_NOT_ELIGIBLE"] });
  });

  it("reports an unknown lane state instead of guessing", () => {
    expect(evaluateAgainstPolicy({ ...load, origin_state_code: null }, policy).reasonCodes).toEqual(["UNKNOWN_LANE_STATE"]);
  });

  it("never treats an empty setting as 'no constraints'", () => {
    const empty: SourcingPolicy = { ...policy, eligible_lanes: [], eligible_equipment: [], rate_bounds: {} };
    expect(evaluateAgainstPolicy(load, empty).reasonCodes).toEqual([
      "NO_LANES_CONFIGURED",
      "NO_EQUIPMENT_CONFIGURED",
      "RATE_BOUNDS_NOT_SET",
    ]);
  });

  it("collects every failing gate, not just the first", () => {
    const result = evaluateAgainstPolicy(
      { ...load, equipment_type: "reefer", target_rate_dollars: 50, rate_ceiling_dollars: 9000 },
      policy
    );
    expect(result.eligible).toBe(false);
    expect(result.reasonCodes).toEqual(["EQUIPMENT_NOT_ELIGIBLE", "TARGET_RATE_BELOW_MINIMUM", "RATE_CEILING_ABOVE_MAXIMUM"]);
  });

  it("allows rates exactly on the bounds", () => {
    expect(evaluateAgainstPolicy({ ...load, target_rate_dollars: 100, rate_ceiling_dollars: 5000 }, policy).eligible).toBe(true);
  });

  it("has plain-language text for every reason code it can return", () => {
    for (const code of ["NO_ACTIVE_POLICY", "NO_LANES_CONFIGURED", "LANE_NOT_ELIGIBLE", "UNKNOWN_LANE_STATE", "NO_EQUIPMENT_CONFIGURED",
      "EQUIPMENT_NOT_ELIGIBLE", "RATE_BOUNDS_NOT_SET", "TARGET_RATE_BELOW_MINIMUM", "RATE_CEILING_ABOVE_MAXIMUM"]) {
      expect(REASON_CODE_TEXT[code], code).toBeTruthy();
    }
  });
});
