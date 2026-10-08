import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import {
  EXCLUSION_REASON_TEXT,
  RANKING_REASON_TEXT,
  type CandidateList,
  type CarrierTier,
} from "@/lib/freight/carrierRanking";

const TIER_COLOR: Record<CarrierTier, "green" | "blue" | "yellow" | "red"> = {
  preferred: "green",
  approved: "blue",
  probationary: "yellow",
  blocked: "red",
};

export function CarrierCandidates({ result }: { result: CandidateList }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h3 className="text-body-lg font-medium text-grey-900">
          <Label text={`Candidates (${result.candidates.length})`} definition="carrierCandidates" />
        </h3>
        {result.candidates.length === 0 ? (
          <Card className="p-6">
            <p className="text-body-sm text-red-700">
              No carrier passed the filters for this load. An exception has been raised for a person to resolve.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {result.candidates.map((c, index) => (
              <Card key={c.carrierId} className="flex flex-col gap-3 p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-body-lg font-medium text-grey-900">
                    {index + 1}. {c.name}
                  </span>
                  <Badge color={TIER_COLOR[c.tier]}>{c.tier}</Badge>
                </div>
                <div className="flex items-center gap-2 text-body-sm text-grey-500">
                  <Label text="Match score" definition="matchScore" />
                  <span className="font-mono text-data-mono text-grey-900">{c.score.toFixed(2)}</span>
                </div>
                {c.lane && (
                  <p className="text-body-sm text-grey-500">
                    {c.lane.mode} · {c.lane.corridor} · {c.lane.transit_days} day{c.lane.transit_days === 1 ? "" : "s"}
                  </p>
                )}
                <div className="flex flex-col gap-1">
                  <span className="text-body-sm text-grey-500"><Label text="Reasons" definition="rankingReasons" /></span>
                  <div className="flex flex-wrap gap-1">
                    {c.reasonCodes.map((code) => (
                      <span
                        key={code}
                        title={code}
                        className="rounded-sm border border-grey-200 bg-grey-25 px-2 py-0.5 text-body-sm text-grey-700"
                      >
                        {RANKING_REASON_TEXT[code] ?? code}
                      </span>
                    ))}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-body-lg font-medium text-grey-900">
          <Label text={`Excluded (${result.excluded.length})`} definition="excludedCarriers" />
        </h3>
        {result.excluded.length === 0 ? (
          <p className="text-body-sm text-grey-500">No carriers were excluded.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {result.excluded.map((x) => (
              <li key={x.carrierId} className="text-body-sm text-grey-400">
                <span className="font-medium">{x.name}</span> ({x.tier}) — {EXCLUSION_REASON_TEXT[x.exclusionReason] ?? x.exclusionReason}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
