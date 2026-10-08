export const USER_ROLES = [
  "administrator",
  "supply_chain_operations_manager",
  "transportation_planner",
  "compliance_analyst",
  "viewer",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  administrator: "Administrator",
  supply_chain_operations_manager: "Supply Chain Operations Manager",
  transportation_planner: "Transportation Planner",
  compliance_analyst: "Compliance Analyst",
  viewer: "Viewer",
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}
