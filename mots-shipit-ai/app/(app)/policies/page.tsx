import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { ControlPanel, type PauseView } from "@/components/control/ControlPanel";
import { createClient } from "@/lib/supabase/server";
import { activePauses } from "@/lib/freight/controlPlane";
import { viewerRole } from "@/lib/freight/viewer";
import { EQUIPMENT_LABELS, formatDollars } from "@/lib/utils/format";

type PolicyRow = {
  id: string;
  customer_id: string;
  version: number;
  status: string;
  eligible_lanes: Array<{ origin_state?: string; destination_state?: string }>;
  eligible_equipment: string[];
  carrier_tiers: string[];
  rate_bounds: { minimum_dollars?: number; maximum_dollars?: number };
  approval_thresholds: { approval_required_above_dollars?: number };
};

export default async function PoliciesPage() {
  const supabase = createClient();
  const [{ data: customers }, { data: policies }, pauses, role] = await Promise.all([
    supabase.schema("master_data_management").from("customers").select("id, name").order("name"),
    supabase
      .schema("operational_excellence_governance")
      .from("sourcing_policies")
      .select("id, customer_id, version, status, eligible_lanes, eligible_equipment, carrier_tiers, rate_bounds, approval_thresholds")
      .order("version", { ascending: false }),
    activePauses(supabase).catch(() => []),
    viewerRole(supabase),
  ]);
  const canControl = role === "administrator" || role === "supply_chain_operations_manager";
  const policyList = (policies ?? []) as PolicyRow[];

  return (
    <main className="flex w-full flex-col gap-10 px-4 py-12 sm:px-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-h5 text-grey-900">Policies and control plane</h1>
        <p className="text-body-sm text-grey-500">Each customer&apos;s sourcing policy, and the switches that pause or resume automation.</p>
      </div>

      <section className="flex flex-col gap-6">
        <h2 className="text-h5 text-grey-900"><Label text="Control plane" definition="activePauses" /></h2>
        <ControlPanel pauses={pauses as PauseView[]} canControl={canControl} />
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="text-h5 text-grey-900"><Label text="Sourcing policies" definition="sourcingPolicy" /></h2>
        {(customers ?? []).length === 0 ? (
          <p className="text-body-sm text-grey-500">No customers yet.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {(customers ?? []).map((c) => {
              const active = policyList.find((p) => p.customer_id === c.id && p.status === "active");
              return (
                <Card key={c.id} className="flex flex-col gap-3 p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-body-lg font-medium text-grey-900">{c.name}</span>
                    {active ? <Badge color="green">Policy v{active.version} active</Badge> : <Badge color="red">No active policy</Badge>}
                  </div>
                  <span className="font-mono text-body-sm text-grey-500">Customer ID {c.id}</span>
                  {active && (
                    <dl className="grid grid-cols-1 gap-2 text-body-sm sm:grid-cols-2">
                      <div><dt className="text-grey-500"><Label text="Lanes" definition="eligibleLanes" /></dt><dd className="font-mono text-grey-900">{active.eligible_lanes.map((l) => `${l.origin_state ?? "*"}→${l.destination_state ?? "*"}`).join(", ") || "None"}</dd></div>
                      <div><dt className="text-grey-500"><Label text="Equipment" definition="eligibleEquipment" /></dt><dd className="text-grey-900">{active.eligible_equipment.map((e) => EQUIPMENT_LABELS[e] ?? e).join(", ") || "None"}</dd></div>
                      <div><dt className="text-grey-500"><Label text="Rate bounds" definition="rateBounds" /></dt><dd className="font-mono text-grey-900">{formatDollars(active.rate_bounds.minimum_dollars)} – {formatDollars(active.rate_bounds.maximum_dollars)}</dd></div>
                      <div><dt className="text-grey-500"><Label text="Carrier tiers" definition="carrierTier" /></dt><dd className="text-grey-900">{active.carrier_tiers.join(", ") || "None"}</dd></div>
                      <div><dt className="text-grey-500">Planner approval limit</dt><dd className="font-mono text-grey-900">{active.approval_thresholds.approval_required_above_dollars !== undefined ? formatDollars(active.approval_thresholds.approval_required_above_dollars) : "Not set (managers approve)"}</dd></div>
                    </dl>
                  )}
                </Card>
              );
            })}
          </div>
        )}
        <p className="text-body-sm text-grey-500">Editing customers and policies in the app comes with the admin screens; for now they&apos;re managed in Supabase.</p>
      </section>
    </main>
  );
}
