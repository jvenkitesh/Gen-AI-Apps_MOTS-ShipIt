"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { LOADING_TEXT } from "@/components/ui/LoadingIndicator";
import { FormMessage } from "@/components/auth/FormMessage";
import { formatDateTime, formatDollars } from "@/lib/utils/format";

export type BookingView = {
  id: string;
  carrier_name: string;
  rate_dollars: number;
  load_version: number;
  tms_sync_status: "pending" | "synced" | "failed";
  tms_external_reference: string | null;
  tms_sync_attempts: number;
  tms_last_error: string | null;
  booked_at: string;
};

const SYNC_COLOR = { pending: "yellow", synced: "green", failed: "red" } as const;

export function BookingPanel({ booking, canRetrySync }: { booking: BookingView; canRetrySync: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function retrySync() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/sync`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) setMessage({ tone: "error", text: json?.message ?? "The TMS sync couldn't be retried." });
      else setMessage(json.booking.tms_sync_status === "synced"
        ? { tone: "success", text: "Booking written to the TMS." }
        : { tone: "error", text: json.booking.tms_last_error ?? "The TMS sync failed again." });
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Can't reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Badge color="green">Booked</Badge>
        <span className="text-body-lg font-medium text-grey-900">{booking.carrier_name}</span>
        <span className="font-mono text-data-mono text-grey-900">{formatDollars(booking.rate_dollars)}</span>
        <span className="text-body-sm text-grey-500">version {booking.load_version} · {formatDateTime(booking.booked_at)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-body-sm text-grey-500"><Label text="TMS sync" definition="tmsSync" /></span>
        <Badge color={SYNC_COLOR[booking.tms_sync_status]}>{booking.tms_sync_status}</Badge>
        {booking.tms_external_reference && <span className="font-mono text-body-sm text-grey-500">TMS ref {booking.tms_external_reference}</span>}
        {booking.tms_sync_status === "failed" && booking.tms_last_error && (
          <span className="text-body-sm text-red-700">{booking.tms_last_error}</span>
        )}
      </div>
      {booking.tms_sync_status !== "synced" && canRetrySync && (
        <div>
          <Button variant="ghost" onClick={retrySync} disabled={busy}>{busy ? LOADING_TEXT : "Retry TMS sync"}</Button>
        </div>
      )}
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
    </Card>
  );
}
