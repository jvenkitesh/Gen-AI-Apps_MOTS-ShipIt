import type { SupabaseClient } from "@supabase/supabase-js";

export type ExceptionRow = {
  id: string;
  load_id: string | null;
  load_version: number | null;
  trigger_type: string;
  details: Record<string, unknown>;
  recommended_action: string | null;
  risk_level: "low" | "medium" | "high" | "critical";
  sla_deadline: string | null;
  status: "open" | "resolved" | "breached";
  resolution: string | null;
  created_at: string;
};

export const EXCEPTION_COLUMNS =
  "id, load_id, load_version, trigger_type, details, recommended_action, risk_level, sla_deadline, status, resolution, created_at";

export const TRIGGER_TEXT: Record<string, string> = {
  policy_ineligible: "Load fails the customer's sourcing policy",
  no_active_policy: "Customer has no active sourcing policy",
  no_candidates: "No carrier passed the filters",
  low_confidence_extraction: "Carrier's price couldn't be read with confidence",
  rate_above_ceiling: "Carrier asked for more than the rate ceiling",
  load_changed_post_acceptance: "Load changed after a carrier accepted",
};

// An exception whose SLA deadline has passed is marked breached -- never silently dropped.
// Runs with the service role whenever the queue or dashboard is read.
export async function markBreachedExceptions(admin: SupabaseClient): Promise<number> {
  const { data, error } = await admin
    .schema("operational_excellence_governance")
    .from("operational_exceptions")
    .update({ status: "breached" })
    .eq("status", "open")
    .lt("sla_deadline", new Date().toISOString())
    .select("id");
  if (error) throw new Error(`Marking breached exceptions failed: ${error.message}`);
  return data?.length ?? 0;
}

export async function listExceptions(client: SupabaseClient, status: "active" | "resolved" = "active"): Promise<ExceptionRow[]> {
  let query = client
    .schema("operational_excellence_governance")
    .from("operational_exceptions")
    .select(EXCEPTION_COLUMNS)
    .limit(200);
  query = status === "active"
    ? query.in("status", ["open", "breached"]).order("sla_deadline", { ascending: true, nullsFirst: false })
    : query.eq("status", "resolved").order("created_at", { ascending: false });
  const { data, error } = await query;
  if (error) throw new Error(`Loading exceptions failed: ${error.message}`);
  return (data ?? []) as ExceptionRow[];
}

// Resolving never resumes a paused scope: pause/resume are separate control-plane actions.
// "escalate" keeps the exception open, raises it to critical and notes why.
export async function resolveException(
  admin: SupabaseClient,
  params: { exceptionId: string; resolverId: string; action: "resolve" | "escalate"; resolution: string }
): Promise<ExceptionRow> {
  const update =
    params.action === "escalate"
      ? { risk_level: "critical", resolution: `Escalated: ${params.resolution}` }
      : { status: "resolved", resolved_by: params.resolverId, resolution: params.resolution };
  const { data, error } = await admin
    .schema("operational_excellence_governance")
    .from("operational_exceptions")
    .update(update)
    .eq("id", params.exceptionId)
    .in("status", ["open", "breached"])
    .select(EXCEPTION_COLUMNS)
    .maybeSingle<ExceptionRow>();
  if (error) throw new Error(`Updating the exception failed: ${error.message}`);
  if (!data) throw new Error("NOT_OPEN");
  return data;
}
