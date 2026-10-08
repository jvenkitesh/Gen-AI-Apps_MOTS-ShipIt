"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { LOADING_TEXT } from "@/components/ui/LoadingIndicator";
import { FormMessage } from "@/components/auth/FormMessage";
import { SlaCountdownBadge } from "@/components/exceptions/SlaCountdownBadge";
import { TRIGGER_TEXT, type ExceptionRow } from "@/lib/freight/exceptions";
import { formatDateTime } from "@/lib/utils/format";

const RISK_COLOR = { low: "grey", medium: "yellow", high: "red", critical: "red" } as const;

export type QueueItem = ExceptionRow & { load_external_id: string | null };

export function ExceptionQueue({ items, canResolve, showResolved }: { items: QueueItem[]; canResolve: boolean; showResolved: boolean }) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function act(id: string, action: "resolve" | "escalate") {
    setBusy(`${action}-${id}`);
    setMessage(null);
    try {
      const res = await fetch(`/api/exceptions/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, resolution: notes[id] ?? "" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) setMessage({ tone: "error", text: json?.message ?? "The exception couldn't be updated." });
      else {
        setMessage({ tone: "success", text: action === "resolve" ? "Exception resolved." : "Exception escalated to critical." });
        router.refresh();
      }
    } catch {
      setMessage({ tone: "error", text: "Can't reach the server. Check your connection and try again." });
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-body-lg text-grey-900">{showResolved ? "No resolved exceptions yet." : "No open exceptions. Nothing needs a person right now."}</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
      {items.map((x) => (
        <Card key={x.id} className="flex flex-col gap-3 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-body-lg font-medium text-grey-900">{TRIGGER_TEXT[x.trigger_type] ?? x.trigger_type}</span>
              <Badge color={RISK_COLOR[x.risk_level]}>{x.risk_level}</Badge>
              {x.status === "breached" && <Badge color="red">breached</Badge>}
              {x.status === "resolved" && <Badge color="green">resolved</Badge>}
            </div>
            {x.status !== "resolved" && <SlaCountdownBadge deadline={x.sla_deadline} />}
          </div>
          <p className="text-body-sm text-grey-500">
            {x.load_id ? (
              <>
                Load{" "}
                <Link href={`/loads/${x.load_id}`} className="font-mono text-blue-500 hover:text-blue-600">
                  {x.load_external_id ?? x.load_id}
                </Link>
                {x.load_version ? ` v${x.load_version}` : ""} ·{" "}
              </>
            ) : null}
            Raised {formatDateTime(x.created_at)} · <span className="font-mono">{x.trigger_type}</span>
          </p>
          {x.recommended_action && <p className="text-body-sm text-grey-900">{x.recommended_action}</p>}
          {x.resolution && <p className="text-body-sm text-grey-500">{x.resolution}</p>}

          {canResolve && x.status !== "resolved" && (
            <div className="flex flex-col gap-2 border-t border-grey-100 pt-3">
              <label htmlFor={`note-${x.id}`} className="sr-only">What was done</label>
              <Input
                id={`note-${x.id}`}
                placeholder="What was done, or why it's escalated"
                value={notes[x.id] ?? ""}
                onChange={(e) => setNotes({ ...notes, [x.id]: e.target.value })}
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => act(x.id, "resolve")} disabled={busy !== null || (notes[x.id] ?? "").trim().length < 3}>
                  {busy === `resolve-${x.id}` ? LOADING_TEXT : "Mark resolved"}
                </Button>
                <Button variant="ghost" onClick={() => act(x.id, "escalate")} disabled={busy !== null || (notes[x.id] ?? "").trim().length < 3}>
                  {busy === `escalate-${x.id}` ? LOADING_TEXT : "Escalate"}
                </Button>
                {x.load_id && (
                  <Link href={`/loads/${x.load_id}`} className="self-center text-body-sm font-medium text-blue-500 hover:text-blue-600">
                    Open load to approve, counter or reject offers
                  </Link>
                )}
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
