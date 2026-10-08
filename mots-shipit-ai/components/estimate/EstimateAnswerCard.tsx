import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { SourceList } from "@/components/estimate/SourceList";
import type { EstimateResult } from "@/lib/estimate/types";
import type { LabelKey } from "@/lib/labelDefinitions";

const dollars = (n: number | null) => (n === null ? "—" : `$${n.toFixed(2)}`);

function Figure({ label, definition, value }: { label: string; definition: LabelKey; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-body-sm text-grey-500"><Label text={label} definition={definition} /></span>
      <span className="font-mono text-data-mono text-grey-900">{value}</span>
    </div>
  );
}

export function EstimateAnswerCard({ question, result }: { question: string; result: EstimateResult }) {
  const { answer, sources, cached } = result;
  const hasRoute = answer.ship_to !== null;

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-body-sm text-grey-500">“{question}”</p>
        {!cached && <Badge color="blue">Freshly calculated</Badge>}
      </div>

      <p className="text-body-lg text-grey-900">{answer.summary}</p>

      {hasRoute && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Figure label="Best choice" definition="bestChoice" value={answer.carrier ? `${answer.carrier}` : "—"} />
            <Figure label="Estimated cost" definition="estimatedCost" value={dollars(answer.usd_estimate)} />
            <Figure label="Transit days" definition="transitDays" value={answer.transit_days === null ? "—" : String(answer.transit_days)} />
            <Figure label="Weight" definition="weight" value={`${answer.weight_pounds} lb${answer.weight_assumed ? " (assumed)" : ""}`} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left">
              <thead>
                <tr className="border-b border-grey-100 text-body-sm text-grey-500">
                  <th className="py-2 pr-4 font-medium"><Label text="Option" definition="option" /></th>
                  <th className="py-2 pr-4 font-medium"><Label text="Carrier" definition="carrier" /></th>
                  <th className="py-2 pr-4 font-medium"><Label text="Cost" definition="cost" /></th>
                  <th className="py-2 font-medium"><Label text="Delivery" definition="delivery" /></th>
                </tr>
              </thead>
              <tbody className="text-body-sm text-grey-900">
                <tr className="border-b border-grey-50">
                  <td className="py-2 pr-4">
                    Routing guide {answer.best_choice === "routing_guide" && <Badge color="green">Best</Badge>}
                  </td>
                  <td className="py-2 pr-4">{answer.routing_guide_carrier ?? "—"} {answer.routing_guide_mode && `(${answer.routing_guide_mode})`}</td>
                  <td className="py-2 pr-4 font-mono">{dollars(answer.routing_guide_cost)}</td>
                  <td className="py-2 font-mono">{answer.transit_days === null ? "—" : `${answer.transit_days} days`}</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">
                    ShipStation {answer.best_choice === "shipstation" && <Badge color="green">Best</Badge>}
                  </td>
                  <td className="py-2 pr-4">
                    {answer.shipstation_carrier
                      ? `${answer.shipstation_carrier}${answer.shipstation_service ? ` · ${answer.shipstation_service}` : ""}`
                      : "Unavailable right now"}
                  </td>
                  <td className="py-2 pr-4 font-mono">{dollars(answer.shipstation_cost)}</td>
                  <td className="py-2 font-mono">
                    {answer.shipstation_delivery_days === null ? "—" : `${answer.shipstation_delivery_days} days`}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="flex flex-wrap items-center gap-x-1 text-body-sm text-grey-500">
            <Label text="Ship-to" definition="shipTo" /> {answer.ship_to}
            {answer.corridor && (
              <>
                <span aria-hidden="true">·</span> <Label text="Corridor" definition="corridor" /> {answer.corridor}
              </>
            )}
          </p>
        </>
      )}

      <SourceList sources={sources} />
    </Card>
  );
}
