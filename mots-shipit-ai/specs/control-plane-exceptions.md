# Spec — Human Control Plane (C8) & Exception Queue

## User flow

1. Any of the PRD's defined exception triggers (low-confidence extraction, rate-above-ceiling, identity/payment change, mid-negotiation load change, preferred-carrier timeout, tool outage/stale compliance) creates an `exceptions` row with a `sla_deadline`.
2. The exception queue (`app/(app)/exceptions/page.tsx`) lists open exceptions ordered by how close they are to breaching SLA.
3. Independently, an admin can pause/resume/override/cancel at any scope (load, customer, lane, agent, channel, global) at any time via the control plane — not just in response to an exception.

## Module interfaces

```ts
// lib/freight/controlPlane.ts
export async function applyControlAction(
  actorId: string, scope: ControlScope, scopeId: string | null,
  action: 'pause' | 'resume' | 'override' | 'cancel', reason: string
): Promise<void>;
// Writes to control_actions. Every write-path module (outreach, negotiation,
// booking) MUST check for an active pause at its relevant scope(s) before acting
// -- this is a cross-cutting check, not just a UI-level toggle.

export async function isPaused(scope: ControlScope, scopeId: string): Promise<boolean>;

// lib/freight/exceptions.ts
export async function raiseException(
  loadId: string, triggerType: string, recommendedAction: string,
  riskLevel: string, slaMinutes: number
): Promise<string>; // returns exception id

export async function resolveException(
  exceptionId: string, resolverId: string, action: string, resolution: string
): Promise<void>;
```

## SLA deadlines by trigger (from the PRD's exception-flow table)

| Trigger | SLA |
|---|---|
| Low-confidence speech/extraction | 5 minutes |
| Rate exceeds ceiling / new term requested | until resolved (no fixed timer — blocks progress) |
| Carrier identity/payment change risk | compliance investigation (no fixed timer) |
| Load changes during negotiation | review if a carrier already accepted (no fixed timer) |
| Preferred carrier fails to confirm | policy-defined timeout, then auto-advance to next ranked offer |
| Tool outage/stale compliance data | fail closed for booking; continue read-only outreach only if policy allows |

## API contract

### `POST /api/control/pause`

Auth: required (`admin` only). Request: `{ "scope": "load"|"customer"|"lane"|"agent"|"channel"|"global", "scopeId": "uuid|null", "reason": "string" }`.

Response: `{ "controlAction": { "id", "scope", "scopeId", "action": "pause", "createdAt" } }`.

Errors: `403` non-admin.

### `GET /api/exceptions`

Auth: required. Response: `{ "items": [{ "id", "loadId", "triggerType", "riskLevel", "slaDeadline", "status" }] }`, ordered by `slaDeadline ASC` (soonest-to-breach first).

### `POST /api/exceptions/:id/resolve`

Auth: required. Request: `{ "action": "approve"|"counter"|"reject"|"escalate", "resolution": "string" }`.

## Component spec

Exception queue cards use the **SLA Countdown Badge** pattern from `docs/design.md` (Saffron while time remains, flips to Red once `slaDeadline` has passed). Each card shows the recommended action and a one-click approve/counter/reject where applicable.

## As built (Feature 8, 2026-10-08)

- `operational_excellence_governance.control_actions` (`supabase/control_actions.sql`): append-only; the latest pause/resume per (scope, scope_id) decides. Scope ids: load id, customer id, lane `TN-GA`, agent `outreach|negotiation|booking`, channel `email|sms`, null for global.
- `lib/freight/controlPlane.ts` `assertNotPaused()` is called by outreach (`contactBatch`), negotiation (`recordCarrierReply`, `respondToOffer`) and booking (`commitBooking`) before any write → `409 PAUSED`. A paused channel skips those carriers (`channel_paused`) instead of failing the batch.
- Control roles: administrator and supply_chain_operations_manager (the PRD's control-plane role). `GET/POST /api/control` (POST covers pause/resume/override/cancel).
- Exceptions (`lib/freight/exceptions.ts`): open exceptions past their SLA are marked `breached` whenever the queue or dashboard is read (never dropped). `GET /api/exceptions` (soonest deadline first), `POST /api/exceptions/[id]/resolve` with `resolve` or `escalate` (escalate keeps it open at critical). Offer approve/counter/reject stays on the load page (linked from each card). Resolving never resumes a pause.
- UI: `/exceptions` queue with live SLA countdown (Saffron → Red), `/dashboard` (breached SLA first, open exceptions, TMS sync pending, loads by status, active-pause banner), `/policies` (control plane + read-only sourcing policies; editing customers/policies in the app is a later admin screen).
- Fix from testing: the outreach batch wait counts only messages actually sent or simulated, so a batch where everyone was skipped (e.g. channel paused) doesn't block the next one.

## Edge cases

- An exception's SLA deadline passes with no human action → status flips to `breached` (not silently removed from the queue); the Operations Manager dashboard surfaces a "breached SLA" count prominently
- A pause is applied at `global` scope while actions are mid-flight at a narrower scope (e.g. a load is mid-negotiation) → the next write-path check (before the next state transition) sees the pause and halts; in-flight reads/UI updates are unaffected, only new write actions are blocked
- Resolving an exception doesn't automatically resume a paused scope — pause/resume are independent actions from exception resolution
