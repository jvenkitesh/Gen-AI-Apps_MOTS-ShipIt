import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { FormMessage } from "@/components/auth/FormMessage";
import { createClient } from "@/lib/supabase/server";
import { EQUIPMENT_LABELS } from "@/lib/utils/format";

type CarrierRow = {
  id: string;
  name: string;
  tier: "preferred" | "approved" | "probationary" | "blocked";
  status: string;
  modes: string[];
  transport_types: string[];
  equipment_types: string[];
  usdot_number: string | null;
  mc_number: string | null;
  source: string;
};

const TIER_COLOR = { preferred: "green", approved: "blue", probationary: "yellow", blocked: "red" } as const;
const SOURCE_LABELS: Record<string, string> = { routing_guide_seed: "Routing guide", manual: "Manual" };

export default async function CarriersPage() {
  const { data, error } = await createClient()
    .schema("data_foundation")
    .from("carriers")
    .select("id, name, tier, status, modes, transport_types, equipment_types, usdot_number, mc_number, source")
    .order("name");
  const carriers = (data ?? []) as CarrierRow[];
  if (error) console.error("[carriers page]", error.code, error.message);

  return (
    <main className="flex w-full flex-col gap-10 px-4 py-12 sm:px-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-h5 text-grey-900">Carriers</h1>
        <p className="text-body-sm text-grey-500">
          Carrier master from Data Foundation. Carriers seeded from the routing guide don&apos;t have USDOT/MC numbers or
          trailer types yet.
        </p>
      </div>

      {error ? (
        <FormMessage tone="error">Carriers couldn&apos;t be loaded. Please try again.</FormMessage>
      ) : carriers.length === 0 ? (
        <Card className="p-6"><p className="text-body-lg text-grey-900">No carriers yet.</p></Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left">
            <thead>
              <tr className="border-b border-grey-100 text-body-sm text-grey-500">
                <th className="px-4 py-3 font-medium"><Label text="Carrier" definition="carrierName" /></th>
                <th className="px-4 py-3 font-medium"><Label text="Tier" definition="carrierTier" /></th>
                <th className="px-4 py-3 font-medium"><Label text="Modes" definition="carrierModes" /></th>
                <th className="px-4 py-3 font-medium"><Label text="Transport" definition="transportTypes" /></th>
                <th className="px-4 py-3 font-medium"><Label text="Equipment" definition="equipmentTypes" /></th>
                <th className="px-4 py-3 font-medium"><Label text="USDOT" definition="usdotNumber" /></th>
                <th className="px-4 py-3 font-medium"><Label text="MC" definition="mcNumber" /></th>
                <th className="px-4 py-3 font-medium"><Label text="Source" definition="carrierSource" /></th>
              </tr>
            </thead>
            <tbody className="text-body-sm text-grey-900">
              {carriers.map((c) => (
                <tr key={c.id} className="border-b border-grey-50">
                  <td className="px-4 py-3 font-medium">
                    {c.name}
                    {c.status !== "active" && <span className="ml-2 text-grey-500">(inactive)</span>}
                  </td>
                  <td className="px-4 py-3"><Badge color={TIER_COLOR[c.tier]}>{c.tier}</Badge></td>
                  <td className="px-4 py-3">{c.modes.join(", ") || "—"}</td>
                  <td className="px-4 py-3 capitalize">{c.transport_types.join(", ") || "—"}</td>
                  <td className="px-4 py-3">
                    {c.equipment_types.length ? c.equipment_types.map((e) => EQUIPMENT_LABELS[e] ?? e).join(", ") : <span className="text-grey-500">Not on file</span>}
                  </td>
                  <td className="px-4 py-3 font-mono">{c.usdot_number ?? "—"}</td>
                  <td className="px-4 py-3 font-mono">{c.mc_number ?? "—"}</td>
                  <td className="px-4 py-3">{SOURCE_LABELS[c.source] ?? c.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </main>
  );
}
