import { Label } from "@/components/ui/Label";
import { FormMessage } from "@/components/auth/FormMessage";
import { AuditTrail } from "@/components/audit/AuditTrail";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { actorNames, recentAuditEvents, type AuditEventRow } from "@/lib/freight/audit";

export default async function ReportsPage() {
  let events: AuditEventRow[] = [];
  let names: Record<string, string> = {};
  let loadError: string | null = null;
  try {
    events = await recentAuditEvents(createClient(), 150);
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) names = await actorNames(createAdminClient(), events);
  } catch (err) {
    console.error("[reports page]", err instanceof Error ? err.message : err);
    loadError = "The audit log couldn't be loaded. Please try again.";
  }

  return (
    <main className="flex w-full flex-col gap-10 px-4 py-12 sm:px-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-h5 text-grey-900">Reports</h1>
        <p className="text-body-sm text-grey-500">
          The audit log across every load. Touchless-booking and compliance analytics come later (Reports sub-theme).
        </p>
      </div>
      <section className="flex flex-col gap-6">
        <h2 className="text-h5 text-grey-900"><Label text="Audit log" definition="auditTrail" /></h2>
        {loadError ? <FormMessage tone="error">{loadError}</FormMessage> : <AuditTrail events={events} actorNames={names} showLoadLinks />}
      </section>
    </main>
  );
}
