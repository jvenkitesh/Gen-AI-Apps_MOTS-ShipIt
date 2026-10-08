import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { FormMessage } from "@/components/auth/FormMessage";
import { LoadStatusBadge } from "@/components/loads/LoadStatusBadge";
import { createClient } from "@/lib/supabase/server";
import { customerNames, listLoads, LOAD_STATUSES, type LoadRow } from "@/lib/freight/loadQueries";
import { EQUIPMENT_LABELS, formatDateTime, formatDollars, formatPounds } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

const FILTERS = [{ value: "", label: "All" }, ...LOAD_STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))];

export default async function LoadsPage({ searchParams }: { searchParams: { status?: string } }) {
  const status = searchParams.status ?? "";
  const supabase = createClient();

  let loads: LoadRow[] = [];
  let names: Record<string, string> = {};
  let loadError: string | null = null;
  try {
    loads = await listLoads(supabase, { status });
    names = await customerNames(supabase, loads.map((l) => l.customer_id));
  } catch (err) {
    console.error("[loads page]", err instanceof Error ? err.message : err);
    loadError = "Loads couldn't be loaded. If this is a new setup, check that the database schemas are exposed in Supabase.";
  }

  return (
    <main className="flex w-full flex-col gap-10 px-4 py-12 sm:px-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-h5 text-grey-900">Loads</h1>
        <p className="text-body-sm text-grey-500">
          Loads received from your TMS and checked against each customer&apos;s sourcing policy.
        </p>
      </div>

      <nav aria-label="Filter loads by status" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value || "all"}
            href={f.value ? `/loads?status=${f.value}` : "/loads"}
            aria-current={status === f.value ? "page" : undefined}
            className={cn(
              "rounded-sm border px-3 py-1 text-body-sm font-medium transition duration-micro ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500",
              status === f.value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-grey-200 bg-white text-grey-500 hover:bg-grey-50"
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {loadError ? (
        <FormMessage tone="error">{loadError}</FormMessage>
      ) : loads.length === 0 ? (
        <Card className="flex flex-col gap-2 p-6">
          <p className="text-body-lg text-grey-900">No loads {status ? `with status “${status}”` : "yet"}.</p>
          <p className="text-body-sm text-grey-500">
            Loads appear here when your TMS sends them to <span className="font-mono">POST /api/loads/webhook</span>.
          </p>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left">
            <thead>
              <tr className="border-b border-grey-100 text-body-sm text-grey-500">
                <th className="px-4 py-3 font-medium"><Label text="Status" definition="loadStatus" /></th>
                <th className="px-4 py-3 font-medium"><Label text="Load" definition="load" /></th>
                <th className="px-4 py-3 font-medium"><Label text="Customer" definition="customer" /></th>
                <th className="px-4 py-3 font-medium"><Label text="Lane" definition="lane" /></th>
                <th className="px-4 py-3 font-medium"><Label text="Equipment" definition="equipment" /></th>
                <th className="px-4 py-3 font-medium"><Label text="Weight" definition="loadWeight" /></th>
                <th className="px-4 py-3 font-medium"><Label text="Target rate" definition="targetRate" /></th>
                <th className="px-4 py-3 font-medium"><Label text="Rate ceiling" definition="rateCeiling" /></th>
                <th className="px-4 py-3 font-medium"><Label text="Pickup" definition="pickup" /></th>
                <th className="px-4 py-3 font-medium"><Label text="Received" definition="received" /></th>
              </tr>
            </thead>
            <tbody className="text-body-sm text-grey-900">
              {loads.map((load) => (
                <tr key={load.id} className="border-b border-grey-50 transition duration-micro ease-out hover:bg-grey-25">
                  <td className="px-4 py-3"><LoadStatusBadge status={load.status} /></td>
                  <td className="px-4 py-3">
                    <Link href={`/loads/${load.id}`} className="font-mono text-blue-500 hover:text-blue-600">
                      {load.external_id}
                    </Link>
                    <span className="ml-1 text-grey-500">v{load.version}</span>
                  </td>
                  <td className="px-4 py-3">{(load.customer_id && names[load.customer_id]) ?? "—"}</td>
                  <td className="px-4 py-3 font-mono">
                    {load.origin_state_code ?? "??"} {load.origin_zipcode} → {load.destination_state_code ?? "??"} {load.destination_zipcode}
                  </td>
                  <td className="px-4 py-3">{EQUIPMENT_LABELS[load.equipment_type]}</td>
                  <td className="px-4 py-3 font-mono">{formatPounds(load.weight_pounds)}</td>
                  <td className="px-4 py-3 font-mono">{formatDollars(load.target_rate_dollars)}</td>
                  <td className="px-4 py-3 font-mono">{formatDollars(load.rate_ceiling_dollars)}</td>
                  <td className="px-4 py-3">{formatDateTime(load.scheduled_pickup_at)}</td>
                  <td className="px-4 py-3">{formatDateTime(load.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </main>
  );
}
