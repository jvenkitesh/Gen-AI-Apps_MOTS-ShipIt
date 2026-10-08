# Spec — Atomic Booking (C7) & Generic TMS Adapter

## User flow

1. An approved offer is selected for booking (manually at MVP — "Assisted Booking," per the PRD's own phased rollout; full autonomy is a later phase).
2. `lib/freight/booking.ts` performs a final policy + compliance recheck, then commits the booking atomically using a client-supplied idempotency key.
3. All other open offers/conversations for that load are closed.
4. The generic TMS adapter interface writes the result back; failures are queued for retry, and the booking is **not** considered fully reconciled until the TMS write succeeds.

## Module interfaces

```ts
// lib/freight/booking.ts
export async function commitBooking(
  loadId: string, offerId: string, idempotencyKey: string
): Promise<BookingResult>;
// 1. Re-check policy (ceiling, eligibility) and compliance freshness -- do not
//    trust any earlier-session result, even from seconds ago.
// 2. INSERT into bookings with idempotencyKey as a UNIQUE constraint target.
//    A duplicate key returns the EXISTING booking row (idempotent), not an error
//    surfaced to the user, and not a second booking.
// 3. On success: UPDATE loads.status = 'booked'; UPDATE other offers for this
//    load to 'rejected'; INSERT audit_events.
// 4. Enqueue TMS sync (see below).

// lib/freight/tmsAdapter.ts
export interface TmsAdapter {
  writeBooking(booking: BookingRecord): Promise<{ synced: boolean; externalRef?: string }>;
}
export class GenericTmsAdapter implements TmsAdapter { /* generic webhook-out implementation */ }
// A concrete adapter (McLeod/Aljex/Turvo/etc.) implements this same interface
// once a real pilot TMS is chosen -- no change needed to booking.ts.
```

## API contract

### `POST /api/loads/:id/book`

Auth: required (`admin` | `sales_rep`). Request: `{ "offerId": "uuid", "idempotencyKey": "uuid" }`.

Response (new booking, 201):
```json
{ "booking": { "id": "uuid", "loadId": "uuid", "carrierId": "uuid", "tmsSyncStatus": "pending" } }
```

Response (retried with the same key, 200 — not an error):
```json
{ "booking": { "id": "uuid", "...": "same row as before" } }
```

Errors: `409` if the load is already booked **by a different offer** (a genuine conflict, as opposed to an idempotent retry of the same booking).

## Component spec

Successful booking triggers a Green success toast (core system's existing Success state — no new pattern). The load detail page shows `tmsSyncStatus` (`pending` / `synced` / `failed`) as a small status chip; `failed` renders in Red with a manual "retry sync" action for the admin.

## As built (Feature 7, 2026-10-08)

- Table `transportation_shipment.carrier_bookings` (`supabase/carrier_bookings.sql`): `idempotency_key` UNIQUE plus a partial unique index allowing one `active` booking per load — the database, not app code, prevents double booking.
- `transportation_shipment.commit_booking()` (service role only) does every check and write in one transaction with the load row locked: idempotent replay, already booked, offer belongs to the load, load version unchanged, load open, offer accepted, rate within ceiling; then inserts the booking, marks the load `booked` and closes all other open offers.
- `lib/freight/booking.ts` re-checks compliance at the moment of booking (fail closed) before calling the function. Database errors map to clear 404/409/422 messages.
- TMS write-back: `lib/freight/tmsAdapter.ts` `GenericTmsAdapter` POSTs `{ event: "booking.created", booking }` to `TMS_BOOKING_WEBHOOK_URL`, signed `X-ShipIt-Signature: sha256=<HMAC of body with TMS_WEBHOOK_SECRET>`, with `Idempotency-Key` = booking id. Failure → `tms_sync_status = failed` + reason; the booking is never rolled back. Retry: `POST /api/bookings/[id]/sync` (administrator, operations manager).
- UI: "Book this carrier" on accepted offers (needs a passing compliance check; one idempotency key per offer per page so double clicks can't double book); Booking panel with TMS sync chip and "Retry TMS sync".
- Audit events are added with Feature 9 (audit log).
- Verified: two simultaneous bookings → one created, one `BOOKING_ALREADY_BOOKED`; retry with the winning key → same booking (`existing`); load `booked`, other offers closed; TMS not connected → `failed`; retry against a mock TMS → `synced`, signature verified.

## Edge cases

- Two near-simultaneous booking requests for the same load (e.g. a race between manual approval and an autonomous rule, once that exists) → the `idempotency_key` UNIQUE constraint at the DB level is the real guard, not application-level locking. The PRD explicitly flags double-booking as Critical severity (C7 risk table) — this constraint is the actual fix, not a nice-to-have.
- TMS write fails after the booking is committed → booking stays `tmsSyncStatus: 'failed'`; a background reconciliation job (or manual retry) retries the write; the booking itself is never rolled back just because the TMS sync failed (the carrier commitment is real regardless of TMS sync state)
- Final recheck (step 1) finds the load has changed version since the offer was created → reject the booking attempt with a clear "load has changed, re-confirm the offer" error rather than booking against stale terms
