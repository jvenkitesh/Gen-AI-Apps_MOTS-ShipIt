# Spec — Audit & Observability (C9)

## User flow

Every state transition across every other component (policy applied, offer created/changed, compliance checked, booking committed, control action taken) writes one immutable row to `audit_events`. This table has no update/delete path, even for admins — it's append-only by RLS policy, not just by convention.

## Module interface

```ts
// lib/freight/audit.ts
export async function recordEvent(
  entityType: string, entityId: string, eventType: string,
  payload: object, modelVersion: string | null, policyVersion: number | null
): Promise<void>;
// Fire-and-forget from the caller's perspective but must complete before the
// caller's own transaction commits, where the event documents that same
// transaction (e.g. a booking commit and its audit_events row should be in the
// same DB transaction, not best-effort afterward).
```

Every other module in this spec set (`booking.ts`, `negotiation.ts`, `compliance.ts`, `controlPlane.ts`) calls `recordEvent()` at its state-changing step — this file defines the sink, not the call sites (those are specified in each respective concern's own spec).

## What gets recorded (non-exhaustive, derived from every other spec's state transitions)

| Entity | Event types |
|---|---|
| `load` | `created`, `version_incremented`, `status_changed` |
| `offer` | `proposed`, `countered`, `accepted`, `expired`, `rejected` |
| `compliance_snapshot` | `checked`, `stale_blocked_booking` |
| `booking` | `committed`, `tms_sync_succeeded`, `tms_sync_failed` |
| `exception` | `raised`, `resolved`, `breached` |
| `control_action` | `pause`, `resume`, `override`, `cancel` |

## As built (Feature 9, 2026-10-08)

- `operational_excellence_governance.audit_events` (`supabase/audit_events.sql`). Immutable three ways: guard triggers reject every update, delete and truncate with `AUDIT_IMMUTABLE` (even for the service role and admins); authenticated gets select only; the service role gets select and insert only.
- Row changes are audited by database triggers (`audit_row_change()`) in the same transaction as the change, so an event can't be lost or written for a change that rolled back. Audited tables: loads, carrier_offers, carrier_compliance_checks, carrier_bookings, operational_exceptions, control_actions. Entity names: `load`, `offer`, `compliance_check` (was `compliance_snapshot` above), `booking`, `exception`, `control_action`. The exception events also include `escalated`.
- `recordEvent(admin, {...})` in `lib/freight/audit.ts` is only for events with no row change of their own: `compliance_check.stale_blocked_booking` (booking.ts) and `offer.extracted` with `model_version` (negotiation.ts, which AI model read the carrier's reply). It throws when the write fails.
- The actor comes from the row (actor_id, decided_by, booked_by, resolved_by, checked_by, created_by), else `auth.uid()`, else "System". `policy_version` comes from the row's `evaluated_policy_version` (load events).
- UI: an audit trail at the bottom of each load page, and the audit log across every load on `/reports` (latest 150, with a link to each load). Actor names are read with the service role because profiles are readable only by their owner.
- Verified live (in a transaction that rolled back): a control-action pause wrote one `control_action.pause` event, and both an update and a delete of it failed with `AUDIT_IMMUTABLE`.
- Fix from Stage 5 testing (migration `fix_audit_row_change_array_append`): `events || 'status_changed'` made Postgres read the literal as an array, so every load status or version change, and every exception escalation, failed with "malformed array literal". The trigger now uses `array_append`. Covered by the test suite (`test/negotiation`, `test/loads`, `test/exceptions`, `test/audit`).
- For the service role, an update or delete is refused by the missing grant ("permission denied") before the guard trigger runs; either refusal leaves the event untouched.

## Edge cases

None by design — this module has no business-logic branches, only writes. The only failure mode is the write itself failing, which should propagate as a failure of the caller's transaction (an audit write failing silently is worse than the whole operation failing loudly).
