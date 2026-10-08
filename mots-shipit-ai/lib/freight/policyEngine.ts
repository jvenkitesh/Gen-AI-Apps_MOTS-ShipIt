export type SourcingPolicy = {
  id: string;
  version: number;
  eligible_lanes: Array<{ origin_state?: string; destination_state?: string }>;
  eligible_equipment: string[];
  rate_bounds: { minimum_dollars?: number; maximum_dollars?: number };
};

export type LoadForEvaluation = {
  origin_state_code: string | null;
  destination_state_code: string | null;
  equipment_type: string;
  target_rate_dollars: number;
  rate_ceiling_dollars: number;
};

export type EligibilityResult = { eligible: boolean; reasonCodes: string[] };

export const REASON_CODE_TEXT: Record<string, string> = {
  NO_ACTIVE_POLICY: "The customer has no active sourcing policy.",
  NO_LANES_CONFIGURED: "The sourcing policy allows no lanes yet.",
  LANE_NOT_ELIGIBLE: "This origin and destination aren't on the policy's allowed lanes.",
  UNKNOWN_LANE_STATE: "The origin or destination zip isn't in a US state ShipIt can route.",
  NO_EQUIPMENT_CONFIGURED: "The sourcing policy allows no equipment types yet.",
  EQUIPMENT_NOT_ELIGIBLE: "The policy doesn't allow this equipment type.",
  RATE_BOUNDS_NOT_SET: "The sourcing policy has no rate range set.",
  TARGET_RATE_BELOW_MINIMUM: "The target rate is below the policy's minimum.",
  RATE_CEILING_ABOVE_MAXIMUM: "The rate ceiling is above the policy's maximum.",
};

const matchesState = (rule: string | undefined, state: string) => !rule || rule === "*" || rule.toUpperCase() === state;

// Hard eligibility gates. A missing or empty setting fails the check -- an unconfigured
// policy never means "no constraints".
export function evaluateAgainstPolicy(load: LoadForEvaluation, policy: SourcingPolicy | null): EligibilityResult {
  if (!policy) return { eligible: false, reasonCodes: ["NO_ACTIVE_POLICY"] };

  const reasonCodes: string[] = [];

  if (!load.origin_state_code || !load.destination_state_code) {
    reasonCodes.push("UNKNOWN_LANE_STATE");
  } else if (!Array.isArray(policy.eligible_lanes) || policy.eligible_lanes.length === 0) {
    reasonCodes.push("NO_LANES_CONFIGURED");
  } else {
    const origin = load.origin_state_code;
    const destination = load.destination_state_code;
    const laneAllowed = policy.eligible_lanes.some(
      (lane) => matchesState(lane.origin_state, origin) && matchesState(lane.destination_state, destination)
    );
    if (!laneAllowed) reasonCodes.push("LANE_NOT_ELIGIBLE");
  }

  if (!Array.isArray(policy.eligible_equipment) || policy.eligible_equipment.length === 0) {
    reasonCodes.push("NO_EQUIPMENT_CONFIGURED");
  } else if (!policy.eligible_equipment.includes(load.equipment_type)) {
    reasonCodes.push("EQUIPMENT_NOT_ELIGIBLE");
  }

  const { minimum_dollars, maximum_dollars } = policy.rate_bounds ?? {};
  if (typeof minimum_dollars !== "number" || typeof maximum_dollars !== "number") {
    reasonCodes.push("RATE_BOUNDS_NOT_SET");
  } else {
    if (load.target_rate_dollars < minimum_dollars) reasonCodes.push("TARGET_RATE_BELOW_MINIMUM");
    if (load.rate_ceiling_dollars > maximum_dollars) reasonCodes.push("RATE_CEILING_ABOVE_MAXIMUM");
  }

  return { eligible: reasonCodes.length === 0, reasonCodes };
}
