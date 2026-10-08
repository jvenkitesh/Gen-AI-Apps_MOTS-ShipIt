import type { SupabaseClient } from "@supabase/supabase-js";
import { COMPLIANCE_REASON_TEXT, getFreshCompliance } from "@/lib/freight/compliance";
import { tmsAdapter, type BookingRecord } from "@/lib/freight/tmsAdapter";
import { assertNotPaused, ScopePausedError } from "@/lib/freight/controlPlane";
import { getLoad } from "@/lib/freight/loadQueries";
import { recordEvent } from "@/lib/freight/audit";

export class BookingError extends Error {
  constructor(message: string, readonly code: string, readonly httpStatus: number) {
    super(message);
  }
}

export type BookingRow = {
  id: string;
  load_id: string;
  load_version: number;
  carrier_id: string;
  offer_id: string;
  rate_dollars: number;
  status: "active" | "cancelled";
  tms_sync_status: "pending" | "synced" | "failed";
  tms_external_reference: string | null;
  tms_sync_attempts: number;
  tms_last_error: string | null;
  booked_at: string;
};

const BOOKING_COLUMNS =
  "id, load_id, load_version, carrier_id, offer_id, rate_dollars, status, tms_sync_status, tms_external_reference, tms_sync_attempts, tms_last_error, booked_at";

// Database errors from commit_booking() -> HTTP status and a plain message.
const DB_ERRORS: Record<string, { status: number; message: string }> = {
  BOOKING_KEY_REUSED: { status: 409, message: "This request key was already used for a different booking." },
  BOOKING_LOAD_NOT_FOUND: { status: 404, message: "Load not found." },
  BOOKING_ALREADY_BOOKED: { status: 409, message: "This load is already booked with a different offer." },
  BOOKING_OFFER_NOT_FOUND: { status: 404, message: "Offer not found for this load." },
  BOOKING_LOAD_CHANGED: { status: 409, message: "The load has changed since this offer. Re-confirm the offer with the carrier." },
  BOOKING_LOAD_NOT_OPEN: { status: 409, message: "The load is no longer open for booking." },
  BOOKING_OFFER_NOT_ACCEPTED: { status: 409, message: "Only an accepted offer can be booked." },
  BOOKING_ABOVE_CEILING: { status: 422, message: "The offer is above the load's rate ceiling." },
};

// C7: commit a booking. Compliance is re-checked at this exact moment (never reused from an
// earlier result); everything else is checked and written atomically in commit_booking().
export async function commitBooking(params: {
  admin: SupabaseClient;
  loadId: string;
  offerId: string;
  idempotencyKey: string;
  userId: string;
}): Promise<{ booking: BookingRow; outcome: "created" | "existing" }> {
  const { admin, loadId, offerId, idempotencyKey, userId } = params;

  const { data: alreadyBooked } = await admin
    .schema("transportation_shipment")
    .from("carrier_bookings")
    .select(BOOKING_COLUMNS)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle<BookingRow>();
  if (alreadyBooked && alreadyBooked.load_id === loadId && alreadyBooked.offer_id === offerId) {
    return { booking: alreadyBooked, outcome: "existing" };
  }

  const { data: offer } = await admin
    .schema("transportation_shipment")
    .from("carrier_offers")
    .select("carrier_id")
    .eq("id", offerId)
    .eq("load_id", loadId)
    .maybeSingle();
  if (!offer) throw new BookingError("Offer not found for this load.", "BOOKING_OFFER_NOT_FOUND", 404);

  const load = await getLoad(admin, loadId);
  if (!load) throw new BookingError("Load not found.", "BOOKING_LOAD_NOT_FOUND", 404);
  try {
    await assertNotPaused(admin, {
      agent: "booking",
      loadId: load.id,
      customerId: load.customer_id,
      originState: load.origin_state_code,
      destinationState: load.destination_state_code,
    });
  } catch (err) {
    if (err instanceof ScopePausedError) throw new BookingError(err.message, "PAUSED", 409);
    throw err;
  }

  const compliance = await getFreshCompliance(admin, offer.carrier_id as string);
  if (compliance.state === "stale") {
    await recordEvent(admin, {
      entityType: "compliance_check",
      entityId: offer.carrier_id as string,
      eventType: "stale_blocked_booking",
      loadId,
      actorId: userId,
      payload: { offer_id: offerId, reason: compliance.reason, last_checked_at: compliance.lastCheckedAt },
    });
    throw new BookingError(compliance.reason, "COMPLIANCE_UNAVAILABLE", 409);
  }
  if (compliance.check.result === "block") {
    const why = compliance.check.reasons.map((r) => COMPLIANCE_REASON_TEXT[r] ?? r).join("; ");
    throw new BookingError(`The carrier failed its compliance check: ${why || "blocked"}.`, "COMPLIANCE_BLOCKED", 409);
  }

  const { data: committed, error } = await admin
    .schema("transportation_shipment")
    .rpc("commit_booking", { p_load_id: loadId, p_offer_id: offerId, p_idempotency_key: idempotencyKey, p_booked_by: userId })
    .single<{ booking_id: string; outcome: "created" | "existing" }>();
  if (error || !committed) {
    const code = error?.message?.match(/^(BOOKING_[A-Z_]+)/)?.[1];
    if (code && DB_ERRORS[code]) throw new BookingError(DB_ERRORS[code].message, code, DB_ERRORS[code].status);
    // The partial unique index is the last line of defence against a concurrent second booking.
    if (error?.code === "23505") throw new BookingError(DB_ERRORS.BOOKING_ALREADY_BOOKED.message, "BOOKING_ALREADY_BOOKED", 409);
    throw new Error(`Booking failed: ${error?.message ?? "no result"}`);
  }

  const { data: booking, error: readError } = await admin
    .schema("transportation_shipment")
    .from("carrier_bookings")
    .select(BOOKING_COLUMNS)
    .eq("id", committed.booking_id)
    .single<BookingRow>();
  if (readError || !booking) throw new Error(`Reading the booking failed: ${readError?.message ?? "no row"}`);

  if (committed.outcome === "created") await syncBookingToTms(admin, booking.id);
  const { data: latest } = await admin
    .schema("transportation_shipment")
    .from("carrier_bookings")
    .select(BOOKING_COLUMNS)
    .eq("id", booking.id)
    .single<BookingRow>();
  return { booking: latest ?? booking, outcome: committed.outcome };
}

// Writes the booking to the TMS. A failure is recorded for retry; the booking itself is never
// rolled back, because the carrier commitment is real regardless of the TMS.
export async function syncBookingToTms(admin: SupabaseClient, bookingId: string): Promise<BookingRow> {
  const { data: booking, error } = await admin
    .schema("transportation_shipment")
    .from("carrier_bookings")
    .select(BOOKING_COLUMNS)
    .eq("id", bookingId)
    .single<BookingRow>();
  if (error || !booking) throw new BookingError("Booking not found.", "NOT_FOUND", 404);
  if (booking.tms_sync_status === "synced") return booking;

  const [{ data: load }, { data: carrier }] = await Promise.all([
    admin.schema("transportation_shipment").from("loads").select("external_id").eq("id", booking.load_id).single(),
    admin.schema("data_foundation").from("carriers").select("name").eq("id", booking.carrier_id).single(),
  ]);
  const record: BookingRecord = {
    id: booking.id,
    load_id: booking.load_id,
    load_external_id: (load?.external_id as string) ?? "",
    load_version: booking.load_version,
    carrier_id: booking.carrier_id,
    carrier_name: (carrier?.name as string) ?? "",
    rate_dollars: Number(booking.rate_dollars),
    booked_at: booking.booked_at,
  };

  const result = await tmsAdapter().writeBooking(record);
  const { data: updated, error: updateError } = await admin
    .schema("transportation_shipment")
    .from("carrier_bookings")
    .update(
      result.synced
        ? { tms_sync_status: "synced", tms_external_reference: result.externalRef, tms_last_error: null, tms_synced_at: new Date().toISOString(), tms_sync_attempts: booking.tms_sync_attempts + 1 }
        : { tms_sync_status: "failed", tms_last_error: result.error, tms_sync_attempts: booking.tms_sync_attempts + 1 }
    )
    .eq("id", booking.id)
    .select(BOOKING_COLUMNS)
    .single<BookingRow>();
  if (updateError || !updated) throw new Error(`Saving the TMS sync result failed: ${updateError?.message ?? "no row"}`);
  return updated;
}
