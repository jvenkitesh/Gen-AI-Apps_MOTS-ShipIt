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

## Edge cases

- Carrier requests a term outside policy bounds → negotiation stops immediately, surfaces to the exception queue with the offer and context attached — never auto-approved outside the ceiling under any circumstance
- Compliance snapshot is stale/unavailable at the exact moment of a booking attempt → booking is blocked even if an earlier snapshot in the same session was fresh; always re-check at the point of commitment, not reuse an earlier in-memory result
- Low-confidence offer extraction → exception (`trigger_type: low_confidence_extraction`) with a 5-minute human review SLA per the PRD's own exception-flow table (this is the Saffron-countdown case)
