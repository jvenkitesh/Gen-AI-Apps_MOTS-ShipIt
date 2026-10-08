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
import { formatDateTime, formatDollars } from "@/lib/utils/format";

export type OfferView = {
  id: string;
  carrier_id: string;
  carrier_name: string;
  rate_dollars: number;
  confidence: number | null;
  evidence: string | null;
  status: "proposed" | "countered" | "accepted" | "rejected" | "expired" | "blocked";
  counter_rate_dollars: number | null;
  decision_note: string | null;
  created_at: string;
  compliance: { state: "pass" | "block" | "unverified"; checkedAt: string | null; source: string | null };
};

const STATUS_COLOR = {
  proposed: "blue", countered: "yellow", accepted: "green", rejected: "grey", expired: "grey", blocked: "red",
} as const;

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; json: Record<string, unknown> | null }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, json: await res.json().catch(() => null) };
  } catch {
    return { ok: false, json: { message: "Can't reach the server. Check your connection and try again." } };
  }
}

function ComplianceBadge({ compliance }: { compliance: OfferView["compliance"] }) {
  if (compliance.state === "pass") return <Badge color="green">Compliance passed {formatDateTime(compliance.checkedAt)}</Badge>;
  if (compliance.state === "block") return <Badge color="red">Compliance failed</Badge>;
  return <Badge color="red">Compliance not verified: approval blocked</Badge>;
}

export function NegotiationPanel({
  loadId,
  contactedCarriers,
  offers,
  canNegotiate,
  canVerify,
  canBook,
}: {
  loadId: string;
  contactedCarriers: Array<{ id: string; name: string }>;
  offers: OfferView[];
  canNegotiate: boolean;
  canVerify: boolean;
  canBook: boolean;
}) {
  // One idempotency key per offer for the life of the page, so a double click or a retry
  // after a network error can never create a second booking.
  const [bookingKeys] = useState<Record<string, string>>({});
  const router = useRouter();
  const [carrierId, setCarrierId] = useState(contactedCarriers[0]?.id ?? "");
  const [replyText, setReplyText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [counter, setCounter] = useState<Record<string, string>>({});
  const [verifyFor, setVerifyFor] = useState<string | null>(null);
  const [verify, setVerify] = useState({ authorityActive: true, insuranceValid: true, result: "pass" as "pass" | "block", note: "" });

  async function submitReply() {
    setBusy("reply");
    setMessage(null);
    const { ok, json } = await postJson(`/api/loads/${loadId}/replies`, { carrierId, replyText });
    setBusy(null);
    if (!ok) return setMessage({ tone: "error", text: String(json?.message ?? "The reply couldn't be recorded.") });
    const kind = json?.kind;
    const text =
      kind === "opted_out" ? "The carrier opted out. They won't be contacted again." :
      kind === "no_offer" ? String(json?.note ?? "No price found in the reply.") :
      kind === "needs_review" ? `${json?.reason} A person needs to review it within 5 minutes; it's in the exceptions list.` :
      json?.blocked ? "The offer is above the rate ceiling. Negotiation stopped and an exception was raised." :
      "Offer recorded.";
    setMessage({ tone: kind === "offer" && !json?.blocked ? "success" : "error", text });
    setReplyText("");
    router.refresh();
  }

  async function respond(offerId: string, action: "approve" | "counter" | "reject") {
    setBusy(`${action}-${offerId}`);
    setMessage(null);
    const counterRateDollars = action === "counter" ? Number(counter[offerId]) : undefined;
    const { ok, json } = await postJson(`/api/offers/${offerId}/respond`, { action, counterRateDollars });
    setBusy(null);
    if (!ok) return setMessage({ tone: "error", text: String(json?.message ?? "The offer couldn't be updated.") });
    setMessage({ tone: "success", text: action === "approve" ? "Offer accepted." : action === "counter" ? "Counter-offer sent." : "Offer rejected." });
    router.refresh();
  }

  async function book(offerId: string) {
    bookingKeys[offerId] ??= crypto.randomUUID();
    setBusy(`book-${offerId}`);
    setMessage(null);
    const { ok, json } = await postJson(`/api/loads/${loadId}/book`, { offerId, idempotencyKey: bookingKeys[offerId] });
    setBusy(null);
    if (!ok) return setMessage({ tone: "error", text: String(json?.message ?? "The booking couldn't be completed.") });
    setMessage({ tone: "success", text: "Load booked. The booking is being written back to the TMS." });
    router.refresh();
  }

  async function submitCheck(carrier: string) {
    setBusy(`verify-${carrier}`);
    setMessage(null);
    const { ok, json } = await postJson(`/api/carriers/${carrier}/compliance`, verify);
    setBusy(null);
    if (!ok) return setMessage({ tone: "error", text: String(json?.message ?? "The check couldn't be saved.") });
    setVerifyFor(null);
    setMessage({ tone: "success", text: "Compliance check recorded." });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}

      {canNegotiate && contactedCarriers.length > 0 && (
        <Card className="flex flex-col gap-3 p-6">
          <h3 className="text-body-lg font-medium text-grey-900"><Label text="Record a carrier reply" definition="carrierReply" /></h3>
          <label htmlFor="reply-carrier" className="sr-only">Carrier</label>
          <select
            id="reply-carrier"
            value={carrierId}
            onChange={(e) => setCarrierId(e.target.value)}
            className="w-full rounded-md border border-grey-200 bg-white px-3 py-2 text-body-lg text-grey-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:w-80"
          >
            {contactedCarriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label htmlFor="reply-text" className="sr-only">Carrier reply</label>
          <textarea
            id="reply-text"
            rows={4}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="e.g. We can cover this for $1,050 all-in, pickup confirmed."
            className="w-full rounded-md border border-grey-200 bg-white px-4 py-3 text-body-lg text-grey-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div>
            <Button onClick={submitReply} disabled={busy !== null || !replyText.trim() || !carrierId}>
              {busy === "reply" ? LOADING_TEXT : "Read reply"}
            </Button>
          </div>
        </Card>
      )}

      {offers.length === 0 ? (
        <p className="text-body-sm text-grey-500">No offers for this load version yet.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {offers.map((o) => {
            const open = o.status === "proposed" || o.status === "countered";
            return (
              <Card key={o.id} className="flex flex-col gap-3 p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-body-lg font-medium text-grey-900">{o.carrier_name}</span>
                  <Badge color={STATUS_COLOR[o.status]}>{o.status}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-body-sm text-grey-500"><Label text="Offer" definition="offerRate" /></span>
                    <span className="font-mono text-data-mono text-grey-900">{formatDollars(o.rate_dollars)}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-body-sm text-grey-500"><Label text="Confidence" definition="offerConfidence" /></span>
                    <span className="font-mono text-data-mono text-grey-900">{o.confidence === null ? "—" : `${Math.round(o.confidence * 100)}%`}</span>
                  </div>
                </div>
                {o.counter_rate_dollars !== null && (
                  <p className="text-body-sm text-grey-500">Countered at <span className="font-mono text-grey-900">{formatDollars(o.counter_rate_dollars)}</span></p>
                )}
                {o.evidence && (
                  <p className="text-body-sm text-grey-500">
                    <Label text="Evidence" definition="offerEvidence" />: <span className="italic text-grey-900">“{o.evidence}”</span>
                  </p>
                )}
                {o.decision_note && <p className="text-body-sm text-grey-500">{o.decision_note}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-body-sm text-grey-500"><Label text="Compliance" definition="compliance" /></span>
                  <ComplianceBadge compliance={o.compliance} />
                  {canVerify && (
                    <button
                      type="button"
                      onClick={() => setVerifyFor(verifyFor === o.carrier_id ? null : o.carrier_id)}
                      className="rounded-sm text-body-sm text-blue-500 hover:text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                    >
                      Record check
                    </button>
                  )}
                </div>

                {canVerify && verifyFor === o.carrier_id && (
                  <div className="flex flex-col gap-2 rounded-md border border-grey-100 bg-grey-25 p-3 text-body-sm text-grey-900">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={verify.authorityActive} onChange={(e) => setVerify({ ...verify, authorityActive: e.target.checked })} />
                      Operating authority is active
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={verify.insuranceValid} onChange={(e) => setVerify({ ...verify, insuranceValid: e.target.checked })} />
                      Insurance on file meets the requirement
                    </label>
                    <label className="flex items-center gap-2">
                      Result
                      <select value={verify.result} onChange={(e) => setVerify({ ...verify, result: e.target.value as "pass" | "block" })} className="rounded-sm border border-grey-200 bg-white px-2 py-1">
                        <option value="pass">Pass</option>
                        <option value="block">Block</option>
                      </select>
                    </label>
                    <label htmlFor={`verify-note-${o.id}`} className="sr-only">How you verified</label>
                    <Input id={`verify-note-${o.id}`} placeholder="How you verified (e.g. FMCSA SAFER lookup, insurance certificate)" value={verify.note} onChange={(e) => setVerify({ ...verify, note: e.target.value })} />
                    <div>
                      <Button onClick={() => submitCheck(o.carrier_id)} disabled={busy !== null || verify.note.trim().length < 3}>
                        {busy === `verify-${o.carrier_id}` ? LOADING_TEXT : "Save check"}
                      </Button>
                    </div>
                  </div>
                )}

                {canBook && o.status === "accepted" && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-grey-100 pt-3">
                    <Button onClick={() => book(o.id)} disabled={busy !== null || o.compliance.state !== "pass"}>
                      {busy === `book-${o.id}` ? LOADING_TEXT : "Book this carrier"}
                    </Button>
                    <span className="text-body-sm text-grey-500"><Label text="What booking does" definition="bookCarrier" /></span>
                  </div>
                )}

                {canNegotiate && open && (
                  <div className="flex flex-col gap-2 border-t border-grey-100 pt-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="flex flex-col gap-1">
                        <label htmlFor={`counter-${o.id}`} className="text-body-sm text-grey-500"><Label text="Counter at" definition="counterRate" /></label>
                        <Input
                          id={`counter-${o.id}`}
                          type="number"
                          min={1}
                          step="0.01"
                          value={counter[o.id] ?? ""}
                          onChange={(e) => setCounter({ ...counter, [o.id]: e.target.value })}
                          className="w-36"
                        />
                      </div>
                      <Button variant="ghost" onClick={() => respond(o.id, "counter")} disabled={busy !== null || !Number(counter[o.id])}>
                        {busy === `counter-${o.id}` ? LOADING_TEXT : "Counter"}
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => respond(o.id, "approve")} disabled={busy !== null}>
                        {busy === `approve-${o.id}` ? LOADING_TEXT : "Approve"}
                      </Button>
                      <Button variant="ghost" onClick={() => respond(o.id, "reject")} disabled={busy !== null}>
                        {busy === `reject-${o.id}` ? LOADING_TEXT : "Reject"}
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
