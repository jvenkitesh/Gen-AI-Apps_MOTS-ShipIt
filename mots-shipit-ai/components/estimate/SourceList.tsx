import { Label } from "@/components/ui/Label";
import type { EstimateSource } from "@/lib/estimate/types";

const KB_LABELS: Record<EstimateSource["kb"], string> = {
  routing_guide: "Routing guide",
  shipstation: "ShipStation",
  unisco_glossary: "Glossary",
};

export function SourceList({ sources }: { sources: EstimateSource[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 border-t border-grey-100 pt-3">
      <span className="text-body-sm font-medium text-grey-500"><Label text="Sources" definition="sources" /></span>
      <ul className="flex flex-col gap-1">
        {sources.map((s) => (
          <li key={`${s.kb}-${s.detail}`} className="text-body-sm text-grey-500">
            <span className="font-medium text-grey-900">{KB_LABELS[s.kb]}:</span>{" "}
            {s.url ? (
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline hover:text-blue-600">
                {s.detail}
              </a>
            ) : (
              s.detail
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
