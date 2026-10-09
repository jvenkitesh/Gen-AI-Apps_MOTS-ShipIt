import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditEventRow = {
  id: number;
  occurred_at: string;
  entity_type: string;
  entity_id: string;
  load_id: string | null;
  event_type: string;
  actor_id: string | null;
  payload: { operation?: string; new?: Record<string, unknown>; old?: Record<string, unknown> | null } & Record<string, unknown>;
  model_version: string | null;
  policy_version: number | null;
};

const AUDIT_COLUMNS = "id, occurred_at, entity_type, entity_id, load_id, event_type, actor_id, payload, model_version, policy_version";

// Row changes are audited by database triggers in the same transaction. Use this only for
// events with no row change of their own (e.g. a booking blocked by stale compliance data).
// A failed audit write throws: an audit write failing silently is worse than the action failing.
export async function recordEvent(
  admin: SupabaseClient,
  event: {
    entityType: string;
    entityId: string;
    eventType: string;
    loadId?: string | null;
    actorId?: string | null;
    payload?: Record<string, unknown>;
    modelVersion?: string | null;
    policyVersion?: number | null;
  }
): Promise<void> {
  const { error } = await admin.schema("operational_excellence_governance").from("audit_events").insert({
    entity_type: event.entityType,
    entity_id: event.entityId,
    load_id: event.loadId ?? null,
    event_type: event.eventType,
    actor_id: event.actorId ?? null,
    payload: event.payload ?? {},
    model_version: event.modelVersion ?? null,
    policy_version: event.policyVersion ?? null,
  });
  if (error) throw new Error(`Writing the audit event failed: ${error.message}`);
}

export async function auditTrailForLoad(client: SupabaseClient, loadId: string): Promise<AuditEventRow[]> {
  const { data, error } = await client
    .schema("operational_excellence_governance")
    .from("audit_events")
    .select(AUDIT_COLUMNS)
    .eq("load_id", loadId)
    .order("occurred_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Loading the audit trail failed: ${error.message}`);
  return (data ?? []) as AuditEventRow[];
}

export async function recentAuditEvents(client: SupabaseClient, limit = 100): Promise<AuditEventRow[]> {
  const { data, error } = await client
    .schema("operational_excellence_governance")
    .from("audit_events")
    .select(AUDIT_COLUMNS)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Loading audit events failed: ${error.message}`);
  return (data ?? []) as AuditEventRow[];
}

// Profiles are readable only by their owner under RLS, so names come from the service role (server only).
export async function actorNames(admin: SupabaseClient, events: AuditEventRow[]): Promise<Record<string, string>> {
  const ids = Array.from(new Set(events.map((e) => e.actor_id).filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return {};
  const { data } = await admin.schema("data_foundation").from("user_profiles").select("id, full_name, email").in("id", ids);
  return Object.fromEntries((data ?? []).map((p) => [p.id as string, (p.full_name as string) || (p.email as string)]));
}

// One plain-language line per event for the audit trail views.
export function describeEvent(e: AuditEventRow): string {
  const n = e.payload?.new ?? {};
  const o = e.payload?.old ?? {};
  const money = (v: unknown) => (v === undefined || v === null ? "" : ` $${Number(v).toFixed(2)}`);
  switch (`${e.entity_type}:${e.event_type}`) {
    case "load:created": return `Load received from the TMS (version ${n.version}).`;
    case "load:version_incremented": return `Load changed: version ${o.version} → ${n.version}.`;
    case "load:status_changed": return `Load status: ${o.status} → ${n.status}.`;
    case "offer:proposed": return `Offer recorded:${money(n.rate_dollars)}.`;
    case "offer:blocked": return `Offer blocked (above ceiling):${money(n.rate_dollars)}.`;
    case "offer:countered": return `Countered at${money(n.counter_rate_dollars)}.`;
    case "offer:accepted": return `Offer accepted:${money(n.rate_dollars)}.`;
    case "offer:rejected": return `Offer rejected${n.decision_note ? `: ${n.decision_note}` : "."}`;
    case "offer:expired": return `Offer expired${n.decision_note ? `: ${n.decision_note}` : "."}`;
    case "offer:injection_suspected": return `Carrier reply held for a person: it tried to instruct the AI.`;
    case "offer:extracted": return `Carrier reply read by ${e.model_version ?? "the AI model"}.`;
    case "booking:committed": return `Booking committed:${money(n.rate_dollars)}.`;
    case "booking:tms_sync_succeeded": return `Booking written to the TMS${n.tms_external_reference ? ` (ref ${n.tms_external_reference})` : ""}.`;
    case "booking:tms_sync_failed": return `TMS write-back failed: ${n.tms_last_error ?? "unknown error"}.`;
    case "exception:raised": return `Exception raised: ${n.trigger_type}.`;
    case "exception:resolved": return `Exception resolved: ${n.resolution ?? ""}`;
    case "exception:breached": return `Exception breached its SLA: ${n.trigger_type}.`;
    case "exception:escalated": return `Exception escalated to critical.`;
    case "compliance_check:checked": return `Compliance check (${n.source}): ${n.result}.`;
    case "compliance_check:stale_blocked_booking": return `Booking blocked: no fresh compliance check.`;
    default:
      if (e.entity_type === "control_action") return `Control plane ${e.event_type}: ${n.scope}${n.scope_id ? ` ${n.scope_id}` : ""} — ${n.reason ?? ""}`;
      return `${e.entity_type} ${e.event_type}`;
  }
}
