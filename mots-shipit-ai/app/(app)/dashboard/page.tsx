import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { markBreachedExceptions } from "@/lib/freight/exceptions";
import { activePauses } from "@/lib/freight/controlPlane";
import { LOAD_STATUSES } from "@/lib/freight/loadQueries";
import type { LabelKey } from "@/lib/labelDefinitions";
import { cn } from "@/lib/utils/cn";

function Stat({ label, definition, value, href, tone = "neutral" }: {
  label: string; definition: LabelKey; value: number; href: string; tone?: "neutral" | "alert" | "warning";
}) {
  return (
    <Link href={href} className="rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
      <Card className={cn(
        "flex h-full flex-col gap-2 p-6 transition duration-micro ease-out hover:shadow-elevation-2",
        tone === "alert" && value > 0 && "border border-red-200 bg-red-50",
        tone === "warning" && value > 0 && "border border-saffron-200 bg-saffron-50"
      )}>
        <span className="text-body-sm text-grey-500"><Label text={label} definition={definition} /></span>
        <span className={cn("font-mono text-h4", tone === "alert" && value > 0 ? "text-red-700" : "text-grey-900")}>{value}</span>
      </Card>
    </Link>
  );
}

const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

export default async function DashboardPage() {
  const supabase = createClient();
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) await markBreachedExceptions(createAdminClient()).catch(() => 0);

  const exceptions = supabase.schema("operational_excellence_governance").from("operational_exceptions");
  const loads = supabase.schema("transportation_shipment").from("loads");
  const bookings = supabase.schema("transportation_shipment").from("carrier_bookings");

  const [breached, open, syncFailed, ...byStatus] = await Promise.all([
    count(exceptions.select("id", { count: "exact", head: true }).eq("status", "breached")),
    count(supabase.schema("operational_excellence_governance").from("operational_exceptions").select("id", { count: "exact", head: true }).eq("status", "open")),
    count(bookings.select("id", { count: "exact", head: true }).eq("status", "active").neq("tms_sync_status", "synced")),
    ...LOAD_STATUSES.map((s) => count(loads.select("id", { count: "exact", head: true }).eq("status", s))),
  ]);
  const pauses = await activePauses(supabase).catch(() => []);

  return (
    <main className="flex w-full flex-col gap-10 px-4 py-12 sm:px-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-h5 text-grey-900">Dashboard</h1>
        <p className="text-body-sm text-grey-500">Coverage and queue health for the Supply Chain Operations Manager.</p>
      </div>

      {pauses.length > 0 && (
        <Link href="/policies" className="rounded-md border border-red-500 bg-red-50 px-4 py-3 text-body-sm text-red-700 hover:bg-red-100">
          <Label text={`${pauses.length} active pause${pauses.length === 1 ? "" : "s"}`} definition="activePauses" /> — automation is stopped for{" "}
          {pauses.map((p) => (p.scope === "global" ? "everything" : `${p.scope} ${p.scope_id}`)).join(", ")}. Open the control plane to review.
        </Link>
      )}

      <section className="flex flex-col gap-6">
        <h2 className="text-h5 text-grey-900">Needs a person</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Breached SLA" definition="breachedExceptions" value={breached} href="/exceptions" tone="alert" />
          <Stat label="Open exceptions" definition="openExceptions" value={open} href="/exceptions" tone="warning" />
          <Stat label="TMS sync not done" definition="tmsSyncFailures" value={syncFailed} href="/loads?status=booked" tone="warning" />
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="text-h5 text-grey-900">Loads by status</h2>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {LOAD_STATUSES.map((s, i) => (
            <Stat key={s} label={s[0].toUpperCase() + s.slice(1)} definition="loadStatus" value={byStatus[i] as number} href={`/loads?status=${s}`} />
          ))}
        </div>
      </section>
    </main>
  );
}
