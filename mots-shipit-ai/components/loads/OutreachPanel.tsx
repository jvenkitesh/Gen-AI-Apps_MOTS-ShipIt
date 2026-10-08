"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { LOADING_TEXT } from "@/components/ui/LoadingIndicator";
import { FormMessage } from "@/components/auth/FormMessage";
import { formatDateTime } from "@/lib/utils/format";

export type InteractionRow = {
  id: string;
  carrier_name: string;
  channel: string;
  outreach_mode: "test" | "live";
  status: "simulated" | "sent" | "failed" | "skipped" | "received";
  recipient: string | null;
  skip_reason: string | null;
  error_message: string | null;
  message_text: string;
  created_at: string;
};

const STATUS_COLOR = { sent: "green", simulated: "blue", failed: "red", skipped: "grey", received: "violet" } as const;
const SKIP_TEXT: Record<string, string> = {
  opted_out: "Carrier opted out",
  frequency_cap: "Contacted too often today",
  no_contact: "No contact on file",
};

export function OutreachPanel({
  loadId,
  mode,
  canContact,
  interactions,
}: {
  loadId: string;
  mode: "test" | "live";
  canContact: boolean;
  interactions: InteractionRow[];
}) {
  const router = useRouter();
  const [batchSize, setBatchSize] = useState(3);
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function contactNext() {
    setIsSending(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/loads/${loadId}/outreach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchSize }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage({ tone: "error", text: json?.message ?? "Carriers couldn't be contacted. Please try again." });
      } else {
        const n = json.contacted.length;
        const verb = json.mode === "test" ? "simulated or sent to the test recipient" : "sent";
        setMessage({
          tone: "success",
          text: n === 0 ? "No carriers were contacted in this batch. See the reasons below." : `${n} carrier${n === 1 ? "" : "s"} contacted (${verb}).`,
        });
        router.refresh();
      }
    } catch {
      setMessage({ tone: "error", text: "Can't reach the server. Check your connection and try again." });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-body-sm text-grey-500"><Label text="Outreach mode" definition="outreachMode" /></span>
        {mode === "test" ? <Badge color="saffron">Test mode: no real carriers contacted</Badge> : <Badge color="red">Live: real carriers</Badge>}
      </div>

      {canContact ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-body-sm text-grey-500" htmlFor="batch-size">
            <Label text="Batch size" definition="batchSize" />
            <select
              id="batch-size"
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              disabled={isSending}
              className="rounded-md border border-grey-200 bg-white px-3 py-2 text-body-lg text-grey-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {[1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <Button onClick={contactNext} disabled={isSending}>
            {isSending ? LOADING_TEXT : "Contact next carriers"}
          </Button>
        </div>
      ) : (
        <p className="text-body-sm text-grey-500">Your role can view outreach but not contact carriers.</p>
      )}

      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}

      {interactions.length === 0 ? (
        <p className="text-body-sm text-grey-500">No carriers contacted for this load version yet.</p>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-grey-100 text-body-sm text-grey-500">
                <th className="px-4 py-3 font-medium"><Label text="Carrier" definition="carrierName" /></th>
                <th className="px-4 py-3 font-medium"><Label text="Channel" definition="outreachChannel" /></th>
                <th className="px-4 py-3 font-medium"><Label text="Result" definition="outreachResult" /></th>
                <th className="px-4 py-3 font-medium"><Label text="Recipient" definition="outreachRecipient" /></th>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Message</th>
              </tr>
            </thead>
            <tbody className="text-body-sm text-grey-900">
              {interactions.map((i) => (
                <tr key={i.id} className="border-b border-grey-50 align-top">
                  <td className="px-4 py-3 font-medium">{i.carrier_name}</td>
                  <td className="px-4 py-3 uppercase">{i.status === "skipped" ? "—" : i.channel}</td>
                  <td className="px-4 py-3">
                    <Badge color={STATUS_COLOR[i.status]}>{i.status}</Badge>
                    {i.skip_reason && <span className="ml-2 text-grey-500">{SKIP_TEXT[i.skip_reason] ?? i.skip_reason}</span>}
                    {i.error_message && <span className="ml-2 text-red-700">{i.error_message}</span>}
                  </td>
                  <td className="px-4 py-3 font-mono">{i.recipient ?? (i.status === "simulated" ? "(simulated)" : "—")}</td>
                  <td className="px-4 py-3">{formatDateTime(i.created_at)}</td>
                  <td className="px-4 py-3">
                    {i.status !== "skipped" && (
                      <button
                        type="button"
                        onClick={() => setPreview(preview === i.id ? null : i.id)}
                        className="rounded-sm text-blue-500 hover:text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                      >
                        {preview === i.id ? "Hide" : "View"}
                      </button>
                    )}
                    {preview === i.id && (
                      <pre className="mt-2 whitespace-pre-wrap rounded-md bg-grey-25 p-3 font-mono text-body-sm text-grey-900">{i.message_text}</pre>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
