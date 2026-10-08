# Spec — Carrier Retrieval & Ranking (C3)

## User flow

Given an eligible load (per the policy-engine spec), `lib/freight/carrierRanking.ts` filters the `carriers` pool by policy (lane, equipment, tier), seeds lane context from `Routing_Guide.json`, and returns a ranked, deduplicated candidate list with reason codes and exclusion explanations.

## Module interface

```ts
// lib/freight/carrierRanking.ts
export async function rankCandidates(loadId: string): Promise<CandidateList>;

type Candidate = {
  carrierId: string;
  legalName: string;
  score: number;                 // 0-1
  reasonCodes: string[];         // e.g. ['lane_match', 'tier_approved', 'service_history_strong']
};
type Excluded = { carrierId: string; legalName: string; exclusionReason: string };
type CandidateList = { candidates: Candidate[]; excluded: Excluded[] };
```

Ranking inputs (no ML model at MVP — deterministic scoring, upgradeable later per the PRD's own "statistical model" suggestion for a future phase):
1. Lane match against `Routing_Guide.json`'s corridor/gateway-city data for the load's origin/destination
2. Carrier tier vs. policy's `carrier_tiers` allowlist
3. Equipment match (`dry_van`/`reefer`)
4. Service history recency (`carriers.service_history` jsonb — most recent successful booking weighted higher)

`Routing_Guide.json` is read directly as a static file (not duplicated into a DB table) via a module-level cache in `lib/estimate/routingGuide.ts` (the same loader the estimate chatbot uses — one source of truth, one file read).

## API contract

### `GET /api/loads/:id/candidates`

Auth: required. Response:
```json
{
  "candidates": [
    { "carrierId": "uuid", "legalName": "Trax", "score": 0.91, "reasonCodes": ["lane_match", "tier_approved"] }
  ],
  "excluded": [
    { "carrierId": "uuid", "legalName": "SomeCarrier", "exclusionReason": "insurance_expired" }
  ]
}
```

Errors: `404` load not found.

## Component spec

Candidate list as cards: carrier name, tier badge, reason-code tags (`docs/design.md` Tag pattern, 6px radius). Excluded carriers rendered greyed (Grey 400 text) with their exclusion reason visible inline, not hidden in a collapsed section — per the PRD's own transparency requirement for exclusion explanations.

## Edge cases

- Zero eligible candidates after filtering → raise an exception (`trigger_type: no_candidates`), never return an empty list silently — this blocks the load from silently stalling in "sourcing" with no visible next step
- A carrier appears in the pool more than once (e.g. duplicate contact records) → dedupe by `carrier_id` before scoring, keep the highest-scoring reason-code set
