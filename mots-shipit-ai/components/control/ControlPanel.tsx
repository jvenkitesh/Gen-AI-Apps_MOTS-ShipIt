"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { LOADING_TEXT } from "@/components/ui/LoadingIndicator";
import { FormMessage } from "@/components/auth/FormMessage";
import { formatDateTime } from "@/lib/utils/format";

export type PauseView = { id: string; scope: string; scope_id: string | null; reason: string; created_at: string };

const SCOPE_HELP: Record<string, string> = {
  global: "Stops all outreach, negotiation and booking.",
  customer: "Customer ID (from the Policies list below).",
  load: "Load ID (from the load's page address).",
  lane: "Origin-destination states, e.g. TN-GA.",
  agent: "outreach, negotiation or booking.",
  channel: "email or sms.",
};

export function ControlPanel({ pauses, canControl }: { pauses: PauseView[]; canControl: boolean }) {
  const router = useRouter();
  const [scope, setScope] = useState("global");
  const [scopeId, setScopeId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function send(action: "pause" | "resume", target: { scope: string; scopeId: string | null }, why: string) {
    setBusy(`${action}-${target.scope}-${target.scopeId ?? ""}`);
    setMessage(null);
    try {
      const res = await fetch("/api/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: target.scope, scopeId: target.scope === "global" ? null : target.scopeId, action, reason: why }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) setMessage({ tone: "error", text: json?.message ?? "The control action couldn't be saved." });
      else {
        setMessage({ tone: "success", text: action === "pause" ? "Paused." : "Resumed." });
        setReason("");
        router.refresh();
      }
    } catch {
      setMessage({ tone: "error", text: "Can't reach the server. Check your connection and try again." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
      {pauses.length === 0 ? (
        <p className="text-body-sm text-grey-500">Nothing is paused. All automation is running.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {pauses.map((p) => (
            <Card key={p.id} className="flex flex-wrap items-center justify-between gap-3 border border-red-200 p-4">
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-2 text-body-lg font-medium text-grey-900">
                  <Badge color="red">Paused</Badge>
                  {p.scope === "global" ? "Everything" : <>{p.scope} <span className="font-mono">{p.scope_id}</span></>}
                </span>
                <span className="text-body-sm text-grey-500">{p.reason} · since {formatDateTime(p.created_at)}</span>
              </div>
              {canControl && (
                <Button variant="ghost" disabled={busy !== null} onClick={() => send("resume", { scope: p.scope, scopeId: p.scope_id }, `Resumed from the control plane (was: ${p.reason})`)}>
                  {busy === `resume-${p.scope}-${p.scope_id ?? ""}` ? LOADING_TEXT : "Resume"}
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      {canControl ? (
        <Card className="flex flex-col gap-3 p-6">
          <h3 className="text-body-lg font-medium text-grey-900">Pause automation</h3>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-body-sm text-grey-500" htmlFor="control-scope">
              <Label text="Scope" definition="controlScope" />
              <select
                id="control-scope"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="rounded-md border border-grey-200 bg-white px-3 py-2 text-body-lg text-grey-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {Object.keys(SCOPE_HELP).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            {scope !== "global" && (
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-body-sm text-grey-500" htmlFor="control-target">
                Target
                <Input id="control-target" value={scopeId} onChange={(e) => setScopeId(e.target.value)} placeholder={SCOPE_HELP[scope]} />
              </label>
            )}
          </div>
          <p className="text-body-sm text-grey-500">{SCOPE_HELP[scope]}</p>
          <label htmlFor="control-reason" className="sr-only">Reason</label>
          <Input id="control-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" />
          <div>
            <Button
              onClick={() => send("pause", { scope, scopeId: scopeId.trim() || null }, reason)}
              disabled={busy !== null || reason.trim().length < 3 || (scope !== "global" && !scopeId.trim())}
            >
              {busy?.startsWith("pause") ? LOADING_TEXT : "Pause"}
            </Button>
          </div>
        </Card>
      ) : (
        <p className="text-body-sm text-grey-500">Only administrators and operations managers can pause or resume automation.</p>
      )}
    </div>
  );
}
