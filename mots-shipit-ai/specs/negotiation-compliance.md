# Spec — Negotiation (C5) & Compliance/Fraud (C6)

## User flow

1. A carrier's reply (via `interactions`) is parsed by `lib/freight/negotiation.ts` into a structured offer: rate, terms, confidence, evidence span.
2. If within the policy's rate ceiling/concession rules, the offer is recorded as `proposed`; otherwise negotiation stops and an exception is raised (`trigger_type: rate_above_ceiling`).
3. Immediately before any booking, `lib/freight/compliance.ts` pulls (or reuses, within a freshness window) a `compliance_snapshots` row for the carrier: authority, insurance, safety, fraud risk.
4. A stale or unavailable compliance snapshot **blocks booking** (fail-closed) — read-only outreach may continue if policy allows, but no commitment.

## Module interfaces

```ts
// lib/freight/negotiation.ts
export async function extractOffer(interactionId: string): Promise<ExtractedOffer>;
// Calls the LLM (lib/ai/negotiationExtractor.ts) with the interaction transcript.
// Schema-constrained output; rejects if confidence < policy threshold -- surfaces
// as an exception rather than guessing.

export async function proposeOffer(
  loadId: string, carrierId: string, amount: number, terms: object
): Promise<OfferResult>;
// Server-side ceiling check happens here, NOT in the LLM prompt -- the prompt
// never receives the confidential rate_ceiling with full precision.

// lib/freight/compliance.ts
export async function getFreshComplianceSnapshot(carrierId: string): Promise<ComplianceSnapshot | { stale: true }>;
// "Fresh" = checked_at within the policy-defined TTL (e.g. 24h). If stale,
// triggers a re-check against the compliance data source; if that also fails
// or the source is unavailable, returns { stale: true } -- caller must block
// booking on this result, never proceed optimistically.
```

## API contract

### `POST /api/offers/:id/respond`

Auth: required. Request: `{ "action": "approve" | "counter" | "reject", "counterTerms"?: object }`.

Response: `{ "offer": { ...updated fields... }, "status": "accepted" | "countered" | "rejected" }`.

Errors: `403` if the action is outside the responding user's approval authority (e.g. a sales_rep trying to approve above their threshold — must escalate to admin instead).

### `GET /api/carriers/:id/compliance`

Auth: required. Response (fresh): `{ "snapshot": { "authorityStatus": "active", "insuranceStatus": "valid", "fraudRiskScore": 0.02, "checkedAt": "..." } }`.

Response (stale, 409): `{ "error": "compliance_data_stale", "lastCheckedAt": "..." }` — frontend must show this as a hard block, not a warning.

## Component spec

Offer cards show rate, terms, and confidence (plain percentage in `Data/Mono` for MVP; the Reports sub-theme's Confidence Score Badge pattern is an option later if that theme gets built out, not required now). Compliance status renders as a pass/block badge (Green/Red) with a link to the evidence bundle.

## As built (Feature 6, 2026-10-08)

- Tables (`supabase/carrier_offers_and_compliance.sql`): `transportation_shipment.carrier_offers` (negotiation ledger) and `operational_excellence_governance.carrier_compliance_checks`; carrier_interactions gains status `received` for inbound replies.
- Carrier replies: inbound provider webhooks don't exist yet, so a user pastes the reply on `/loads/[id]` (`POST /api/loads/[id]/replies`). Replies starting with STOP opt the contact out.
- Extraction (`lib/ai/offerExtractor.ts`, OpenAI): reads only the carrier's words (never the target rate or ceiling); the quoted evidence must appear verbatim in the reply or confidence is capped at 0.3. Below `OFFER_MIN_CONFIDENCE` (default 0.8) → `low_confidence_extraction` exception, high risk, 5-minute SLA; no offer is guessed.
- Ceiling check in code: above the load's rate ceiling → offer `blocked` + `rate_above_ceiling` exception. Counters above the ceiling are refused.
- `POST /api/offers/[id]/respond` (approve | counter | reject): stale-version and already-decided offers refused (409). Approval authority: administrator and operations manager unlimited; transportation planner only up to `sourcing_policies.approval_thresholds.approval_required_above_dollars` (unset → must escalate, 403). Compliance and viewer roles can't respond.
- Approval runs a fresh compliance check at that moment (`lib/freight/compliance.ts`): a check within `COMPLIANCE_FRESHNESS_HOURS` (default 24), else an FMCSA QCMobile re-check when `FMCSA_WEB_KEY` and the carrier's USDOT number exist, else **blocked** (fail closed). A failed check blocks too.
- `GET /api/carriers/[id]/compliance` (fresh 200 / stale 409) and `POST` for a manual check (compliance analyst, administrator).
- Counter-offers are sent through the outreach channel rules (test mode → simulated or test recipient) and logged verbatim.
- New load version: open offers for older versions expire; an already accepted older offer raises `load_changed_post_acceptance`.

## Edge cases

- Carrier requests a term outside policy bounds → negotiation stops immediately, surfaces to the exception queue with the offer and context attached — never auto-approved outside the ceiling under any circumstance
- Compliance snapshot is stale/unavailable at the exact moment of a booking attempt → booking is blocked even if an earlier snapshot in the same session was fresh; always re-check at the point of commitment, not reuse an earlier in-memory result
- Low-confidence offer extraction → exception (`trigger_type: low_confidence_extraction`) with a 5-minute human review SLA per the PRD's own exception-flow table (this is the Saffron-countdown case)
