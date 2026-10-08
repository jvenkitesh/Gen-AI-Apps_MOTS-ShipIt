import type { SupabaseClient } from "@supabase/supabase-js";

export const CONTROL_SCOPES = ["global", "customer", "load", "lane", "agent", "channel"] as const;
export type ControlScope = (typeof CONTROL_SCOPES)[number];
export type ControlActionType = "pause" | "resume" | "override" | "cancel";
export type Agent = "outreach" | "negotiation" | "booking";

export type ControlActionRow = {
  id: string;
  actor_id: string;
  scope: ControlScope;
  scope_id: string | null;
  action: ControlActionType;
  reason: string;
  created_at: string;
};

export class ScopePausedError extends Error {
  readonly code = "PAUSED";
  constructor(readonly scope: ControlScope, readonly scopeId: string | null, readonly reason: string) {
    super(
      `Paused by the control plane (${scope === "global" ? "everything" : `${scope} ${scopeId}`}): ${reason}. ` +
        "An administrator or operations manager must resume it first."
    );
  }
}

export const laneKey = (origin: string | null, destination: string | null) => `${origin ?? "??"}-${destination ?? "??"}`;

export async function applyControlAction(
  admin: SupabaseClient,
  params: { actorId: string; scope: ControlScope; scopeId: string | null; action: ControlActionType; reason: string }
): Promise<ControlActionRow> {
  const { data, error } = await admin
    .schema("operational_excellence_governance")
    .from("control_actions")
    .insert({
      actor_id: params.actorId,
      scope: params.scope,
      scope_id: params.scope === "global" ? null : params.scopeId,
      action: params.action,
      reason: params.reason,
    })
    .select("id, actor_id, scope, scope_id, action, reason, created_at")
    .single<ControlActionRow>();
  if (error || !data) throw new Error(`Saving the control action failed: ${error?.message ?? "no row"}`);
  return data;
}

// Every currently paused scope: the latest pause/resume per (scope, scope_id) is a pause.
export async function activePauses(client: SupabaseClient): Promise<ControlActionRow[]> {
  const { data, error } = await client
    .schema("operational_excellence_governance")
    .from("control_actions")
    .select("id, actor_id, scope, scope_id, action, reason, created_at")
    .in("action", ["pause", "resume"])
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`Reading control actions failed: ${error.message}`);
  const latest = new Map<string, ControlActionRow>();
  for (const row of (data ?? []) as ControlActionRow[]) {
    const key = `${row.scope}|${row.scope_id ?? ""}`;
    if (!latest.has(key)) latest.set(key, row);
  }
  return Array.from(latest.values()).filter((r) => r.action === "pause");
}

export async function isPaused(client: SupabaseClient, scope: ControlScope, scopeId: string | null): Promise<boolean> {
  const pauses = await activePauses(client);
  return pauses.some((p) => p.scope === scope && (p.scope_id ?? null) === (scopeId ?? null));
}

// Cross-cutting guard: outreach, negotiation and booking call this before every write.
// Throws ScopePausedError naming the first matching pause.
export async function assertNotPaused(
  client: SupabaseClient,
  context: {
    agent: Agent;
    loadId?: string;
    customerId?: string | null;
    originState?: string | null;
    destinationState?: string | null;
    channel?: "email" | "sms" | null;
  }
): Promise<void> {
  const pauses = await activePauses(client);
  const checks: Array<[ControlScope, string | null]> = [
    ["global", null],
    ["agent", context.agent],
  ];
  if (context.loadId) checks.push(["load", context.loadId]);
  if (context.customerId) checks.push(["customer", context.customerId]);
  if (context.originState || context.destinationState) checks.push(["lane", laneKey(context.originState ?? null, context.destinationState ?? null)]);
  if (context.channel) checks.push(["channel", context.channel]);

  for (const [scope, scopeId] of checks) {
    const hit = pauses.find((p) => p.scope === scope && (p.scope_id ?? null) === scopeId);
    if (hit) throw new ScopePausedError(scope, scopeId, hit.reason);
  }
}
