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

## Edge cases

None by design — this module has no business-logic branches, only writes. The only failure mode is the write itself failing, which should propagate as a failure of the caller's transaction (an audit write failing silently is worse than the whole operation failing loudly).
