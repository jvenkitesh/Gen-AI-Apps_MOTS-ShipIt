# Spec — Conversation Agents / Outreach (C4)

Voice is explicitly deferred (Architecture Decision, Stage 1). This spec covers SMS + email only, designed behind a channel interface so voice can be added later without reworking the outreach flow.

## User flow

1. Admin/sales_rep (or an automated trigger once autonomy increases) calls `POST /api/loads/:id/outreach` with a batch size.
2. `lib/freight/outreach.ts` selects the next N un-contacted ranked candidates (from the carrier-ranking spec) whose `carrier_contacts.opt_out` is `false`, respecting per-contact frequency caps.
3. For each, send a channel-appropriate message disclosing AI identity, confirming load facts, and logging the interaction verbatim.

## Module interface

```ts
// lib/freight/outreach.ts
export interface OutreachChannel {
  send(contact: CarrierContact, message: OutreachMessage): Promise<{ sent: boolean; channelRef: string }>;
}
export class SmsChannel implements OutreachChannel { /* Twilio or equivalent, Phase 2 wiring */ }
export class EmailChannel implements OutreachChannel { /* transactional email provider, Phase 2 wiring */ }
// A VoiceChannel implementing the same interface is added in Phase 2, once legal
// sign-off on AI voice disclosure/TCPA exists -- no change to outreach.ts needed then.

export async function contactBatch(loadId: string, batchSize: number): Promise<OutreachResult[]>;
```

Note: the actual SMS/email provider account setup is a Phase 1 implementation task, not resolved in this spec — the interface above is what matters architecturally; which concrete provider (Twilio for SMS, a transactional email service) gets wired in during feature-build, without blocking this spec.

## Disclosure requirement (PRD-mandated, not optional)

Every outreach message's first line is a fixed, policy-controlled disclosure string (e.g. "This is an automated message from MOTS ShipIt on behalf of [broker]. Reply STOP to opt out.") — stored in `policies` (or a dedicated disclosure-template field), never generated freely by the LLM, and logged verbatim in `interactions.disclosures`.

## API contract

### `POST /api/loads/:id/outreach`

Auth: required (`admin` | `sales_rep`). Request: `{ "batchSize": 5 }`.

Response:
```json
{ "contacted": [{ "carrierId": "uuid", "channel": "sms", "channelRef": "msg_abc123" }] }
```

Errors: `409` if the load is already `booked` (no outreach on a closed load).

## Edge cases

- Contact has `opt_out: true` → excluded from the batch entirely, never contacted, never counted toward batch size
- Frequency cap exceeded for a contact → skipped this round, retried next eligible window
- Batch exhausted with zero responses → expand to the next ranked batch **only after** the policy-defined timeout elapses, not immediately (prevents carrier fatigue from over-contacting)
- Channel send fails (provider error) → retried once, then logged as a failed interaction and that carrier is skipped for this round (does not block the rest of the batch)
