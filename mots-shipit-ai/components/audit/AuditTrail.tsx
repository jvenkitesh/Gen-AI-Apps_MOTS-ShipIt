import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { describeEvent, type AuditEventRow } from "@/lib/freight/audit";
import { formatDateTime } from "@/lib/utils/format";

export function AuditTrail({
  events,
  actorNames,
  showLoadLinks = false,
}: {
  events: AuditEventRow[];
  actorNames: Record<string, string>;
  showLoadLinks?: boolean;
}) {
  if (events.length === 0) return <p className="text-body-sm text-grey-500">No audit events yet.</p>;
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left">
        <thead>
          <tr className="border-b border-grey-100 text-body-sm text-grey-500">
            <th className="px-4 py-3 font-medium">When</th>
            <th className="px-4 py-3 font-medium">What happened</th>
            <th className="px-4 py-3 font-medium">Who</th>
            {showLoadLinks && <th className="px-4 py-3 font-medium">Load</th>}
          </tr>
        </thead>
        <tbody className="text-body-sm text-grey-900">
          {events.map((e) => (
            <tr key={e.id} className="border-b border-grey-50 align-top">
              <td className="whitespace-nowrap px-4 py-3 font-mono">{formatDateTime(e.occurred_at)}</td>
              <td className="px-4 py-3">
                {describeEvent(e)}
                <span className="ml-2 font-mono text-grey-500">{e.entity_type}.{e.event_type}</span>
              </td>
              <td className="px-4 py-3">{e.actor_id ? actorNames[e.actor_id] ?? "A user" : "System"}</td>
              {showLoadLinks && (
                <td className="px-4 py-3">
                  {e.load_id ? <Link href={`/loads/${e.load_id}`} className="text-blue-500 hover:text-blue-600">Open</Link> : "—"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
