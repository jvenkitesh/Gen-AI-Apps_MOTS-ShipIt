import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { FormMessage } from "@/components/auth/FormMessage";
import { LoadStatusBadge } from "@/components/loads/LoadStatusBadge";
import { createClient } from "@/lib/supabase/server";
import { customerNames, getLoad, type LoadRow } from "@/lib/freight/loadQueries";
import { REASON_CODE_TEXT } from "@/lib/freight/policyEngine";
import type { LabelKey } from "@/lib/labelDefinitions";
import { EQUIPMENT_LABELS, formatDateTime, formatDollars, formatPounds } from "@/lib/utils/format";

type Policy = {
  id: string;
  version: number;
  status: string;
  eligible_lanes: Array<{ origin_state?: string; destination_state?: string }>;
  eligible_equipment: string[];
  rate_bounds: { minimum_dollars?: number; maximum_dollars?: number };
};

type OperationalException = {
  id: string;
  load_version: number | null;
  trigger_type: string;
  recommended_action: string | null;
  risk_level: string;
  sla_deadline: string | null;
  status: string;
  created_at: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Field({ text, definition, children }: { text: string; definition: LabelKey; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-body-sm text-grey-500"><Label text={text} definition={definition} /></span>
      <span className="text-body-lg text-grey-900">{children}</span>
    </div>
  );
}

export default async function LoadDetailPage({ params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) notFound();
  const supabase = createClient();

  let load: LoadRow | null = null;
  let customerName = "—";
  let policy: Policy | null = null;
  let exceptions: OperationalException[] = [];
  let loadError: string | null = null;

  try {
    load = await getLoad(supabase, params.id);
    if (load) {
      const names = await customerNames(supabase, [load.customer_id]);
      customerName = (load.customer_id && names[load.customer_id]) || "—";
      if (load.evaluated_policy_id) {
        const { data } = await supabase
          .schema("operational_excellence_governance")
          .from("sourcing_policies")
          .select("id, version, status, eligible_lanes, eligible_equipment, rate_bounds")
          .eq("id", load.evaluated_policy_id)
          .maybeSingle<Policy>();
        policy = data;
      }
      const { data: exceptionRows } = await supabase
        .schema("operational_excellence_governance")
        .from("operational_exceptions")
        .select("id, load_version, trigger_type, recommended_action, risk_level, sla_deadline, status, created_at")
        .eq("load_id", load.id)
        .order("created_at", { ascending: false });
      exceptions = (exceptionRows ?? []) as OperationalException[];
    }
  } catch (err) {
    console.error("[load detail]", err instanceof Error ? err.message : err);
    loadError = "This load couldn't be loaded. Please try again.";
  }

  if (!loadError && !load) notFound();

  return (
    <main className="flex w-full flex-col gap-10 px-4 py-12 sm:px-16">
      <Link href="/loads" className="text-body-sm font-medium text-blue-500 hover:text-blue-600">
        ← All loads
      </Link>

      {loadError || !load ? (
        <FormMessage tone="error">{loadError}</FormMessage>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-h5 text-grey-900">{load.external_id}</h1>
            <span className="text-body-sm text-grey-500">version {load.version}</span>
            <LoadStatusBadge status={load.status} />
          </div>

          <section className="flex flex-col gap-6">
            <h2 className="text-h5 text-grey-900">Load</h2>
            <Card className="grid gap-6 p-6 sm:grid-cols-2 lg:grid-cols-4">
              <Field text="Customer" definition="customer">{customerName}</Field>
              <Field text="Lane" definition="lane">
                <span className="font-mono text-data-mono">
                  {load.origin_state_code ?? "??"} {load.origin_zipcode} → {load.destination_state_code ?? "??"} {load.destination_zipcode}
                </span>
              </Field>
              <Field text="Equipment" definition="equipment">{EQUIPMENT_LABELS[load.equipment_type]}</Field>
              <Field text="Commodity" definition="commodity">{load.commodity}</Field>
              <Field text="Weight" definition="loadWeight"><span className="font-mono text-data-mono">{formatPounds(load.weight_pounds)}</span></Field>
              <Field text="Target rate" definition="targetRate"><span className="font-mono text-data-mono">{formatDollars(load.target_rate_dollars)}</span></Field>
              <Field text="Rate ceiling" definition="rateCeiling"><span className="font-mono text-data-mono">{formatDollars(load.rate_ceiling_dollars)}</span></Field>
              <Field text="Received" definition="received">{formatDateTime(load.created_at)}</Field>
              <Field text="Pickup" definition="pickup">{formatDateTime(load.scheduled_pickup_at)}</Field>
              <Field text="Delivery" definition="delivery_scheduled">{formatDateTime(load.scheduled_delivery_at)}</Field>
            </Card>
          </section>

          <section className="flex flex-col gap-6">
            <h2 className="text-h5 text-grey-900"><Label text="Eligibility" definition="eligibility" /></h2>
            <Card className="flex flex-col gap-4 p-6">
              {load.eligibility_reason_codes.length === 0 && load.status !== "exception" ? (
                <div className="flex items-center gap-2">
                  <Badge color="green">Eligible</Badge>
                  <span className="text-body-sm text-grey-500">Passed every rule in the sourcing policy. Checked {formatDateTime(load.evaluated_at)}.</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Badge color="red">Not eligible</Badge>
                    <span className="text-body-sm text-grey-500"><Label text="Reasons" definition="reasonCodes" /></span>
                  </div>
                  <ul className="flex flex-col gap-1">
                    {load.eligibility_reason_codes.map((code) => (
                      <li key={code} className="text-body-sm text-grey-900">
                        <span className="font-mono text-grey-500">{code}</span> — {REASON_CODE_TEXT[code] ?? code}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {policy ? (
                <div className="grid gap-6 border-t border-grey-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field text="Policy version" definition="policyVersion">v{policy.version} ({policy.status})</Field>
                  <Field text="Eligible lanes" definition="eligibleLanes">
                    <span className="font-mono text-data-mono">
                      {policy.eligible_lanes.length === 0
                        ? "None"
                        : policy.eligible_lanes.map((l) => `${l.origin_state ?? "*"}→${l.destination_state ?? "*"}`).join(", ")}
                    </span>
                  </Field>
                  <Field text="Eligible equipment" definition="eligibleEquipment">
                    {policy.eligible_equipment.length === 0 ? "None" : policy.eligible_equipment.map((e) => EQUIPMENT_LABELS[e] ?? e).join(", ")}
                  </Field>
                  <Field text="Rate bounds" definition="rateBounds">
                    <span className="font-mono text-data-mono">
                      {formatDollars(policy.rate_bounds.minimum_dollars)} – {formatDollars(policy.rate_bounds.maximum_dollars)}
                    </span>
                  </Field>
                </div>
              ) : (
                <p className="border-t border-grey-100 pt-4 text-body-sm text-grey-500">
                  <Label text="Sourcing policy" definition="sourcingPolicy" />: none active for this customer when the load arrived.
                </p>
              )}
            </Card>
          </section>

          <section className="flex flex-col gap-6">
            <h2 className="text-h5 text-grey-900"><Label text="Exceptions" definition="exceptions" /></h2>
            {exceptions.length === 0 ? (
              <p className="text-body-sm text-grey-500">No exceptions for this load.</p>
            ) : (
              <Card className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left">
                  <thead>
                    <tr className="border-b border-grey-100 text-body-sm text-grey-500">
                      <th className="px-4 py-3 font-medium">Problem</th>
                      <th className="px-4 py-3 font-medium"><Label text="Risk" definition="riskLevel" /></th>
                      <th className="px-4 py-3 font-medium"><Label text="SLA deadline" definition="slaDeadline" /></th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">What to do</th>
                    </tr>
                  </thead>
                  <tbody className="text-body-sm text-grey-900">
                    {exceptions.map((x) => (
                      <tr key={x.id} className="border-b border-grey-50 align-top">
                        <td className="px-4 py-3 font-mono">{x.trigger_type}{x.load_version ? ` (v${x.load_version})` : ""}</td>
                        <td className="px-4 py-3">{x.risk_level}</td>
                        <td className="px-4 py-3">
                          <Badge color={x.status === "open" ? "saffron" : "grey"}>{formatDateTime(x.sla_deadline)}</Badge>
                        </td>
                        <td className="px-4 py-3">{x.status}</td>
                        <td className="px-4 py-3">{x.recommended_action ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-h5 text-grey-900">Carrier candidates and offers</h2>
            <p className="text-body-sm text-grey-500">Ranked carriers and negotiation offers appear here once carrier ranking and negotiation are built.</p>
          </section>
        </>
      )}
    </main>
  );
}
