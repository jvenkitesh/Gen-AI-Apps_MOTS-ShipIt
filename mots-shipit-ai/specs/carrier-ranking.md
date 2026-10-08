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

## As built (Feature 4, 2026-10-08)

- Carrier master: `data_foundation.carriers` (+ `carrier_contacts`), seeded from the distinct carriers in `transportation_shipment.routing_guide` (`supabase/carriers.sql`). Seeded rows: tier `approved`, no USDOT/MC, empty `equipment_types`.
- Lane context comes from the `transportation_shipment.routing_guide` table (not the JSON file): a carrier is a candidate only if the routing guide enables it for the load's destination state.
- Scoring (`lib/freight/carrierRanking.ts`, weights sum to 1.0): lane match 0.45, origin hub state match 0.10, tier (preferred 0.25 / approved 0.18 / probationary 0.08), equipment match 0.10 (empty equipment = `equipment_unverified`, no points, not excluded), service history (booked ≤30 days 0.10, ≤90 days 0.05).
- Exclusions: `carrier_inactive`, `tier_blocked`, `policy_has_no_carrier_tiers`, `tier_not_allowed`, `not_in_routing_guide_for_lane`, `equipment_mismatch`.
- Only loads with status `sourcing`/`negotiating` are ranked (`409 LOAD_NOT_ELIGIBLE` otherwise). Zero candidates raises one open `no_candidates` exception per load version (high risk, 4-hour SLA).
- UI: candidate cards on `/loads/[id]` (excluded carriers greyed inline with reasons) and a `/carriers` directory.
- Test data: `supabase/seed_test_customer.sql` creates "Test Customer (demo)" with an active policy (TN → any state, dry van + reefer, preferred/approved tiers, $100–$10,000).

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
