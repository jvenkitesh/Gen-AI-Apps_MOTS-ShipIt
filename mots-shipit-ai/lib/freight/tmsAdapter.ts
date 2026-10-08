import { createHmac } from "node:crypto";

export type BookingRecord = {
  id: string;
  load_id: string;
  load_external_id: string;
  load_version: number;
  carrier_id: string;
  carrier_name: string;
  rate_dollars: number;
  booked_at: string;
};

export type TmsWriteResult = { synced: true; externalRef: string | null } | { synced: false; error: string };

// Every TMS (McLeod, Aljex, Turvo, ...) implements this one interface; booking.ts never changes.
export interface TmsAdapter {
  writeBooking(booking: BookingRecord): Promise<TmsWriteResult>;
}

// Generic webhook-out: POSTs the booking as JSON to TMS_BOOKING_WEBHOOK_URL, signed with
// HMAC-SHA256 of the body using TMS_WEBHOOK_SECRET (header X-ShipIt-Signature).
export class GenericTmsAdapter implements TmsAdapter {
  constructor(private url: string | undefined, private secret: string | undefined) {}

  async writeBooking(booking: BookingRecord): Promise<TmsWriteResult> {
    if (!this.url) return { synced: false, error: "No TMS is connected yet (TMS_BOOKING_WEBHOOK_URL is not set)." };
    if (!this.secret) return { synced: false, error: "TMS_WEBHOOK_SECRET is not set." };

    const body = JSON.stringify({ event: "booking.created", booking });
    const signature = createHmac("sha256", this.secret).update(body).digest("hex");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-ShipIt-Signature": `sha256=${signature}`, "Idempotency-Key": booking.id },
        body,
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok) return { synced: false, error: `TMS answered ${res.status}` };
      const json = (await res.json().catch(() => null)) as { reference?: string; id?: string } | null;
      return { synced: true, externalRef: json?.reference ?? json?.id ?? null };
    } catch (err) {
      return { synced: false, error: err instanceof Error ? err.message : "TMS request failed" };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function tmsAdapter(): TmsAdapter {
  return new GenericTmsAdapter(process.env.TMS_BOOKING_WEBHOOK_URL, process.env.TMS_WEBHOOK_SECRET);
}
