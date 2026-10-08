# Spec — Load-Estimate Chatbot

Phase 1 flagship feature. A user asks for a USD load estimate for a US zip/state; the agent checks a Supabase cache first, then consults 3 knowledge sources, composes a cited answer, and writes it back to the cache.

## User flow

1. User types a free-text query into the chat input on `app/(app)/estimate/page.tsx` (e.g. "what's the estimate to zip 30303").
2. Frontend calls `POST /api/estimate` with `{ query }`.
3. Backend parses the query for a 5-digit US zip or a state name/code. If neither is found → `400`.
4. Backend checks `transportation_shipment.load_estimate_cache` for `(geography, zip_or_state, query_type)` where `expires_at > now()` (answers are valid for 24 hours).
   - **Hit:** return immediately, `cached: true`.
   - **Miss:** call KB1 + KB2 in parallel, KB3 as needed, compose the answer, upsert into the cache, return `cached: false`.
5. Frontend renders an answer card.

## Knowledge sources

| KB | Source | Call pattern |
|---|---|---|
| KB1 | Supabase table `transportation_shipment.routing_guide` (seeded from `data/Routing_Guide.json` via `scripts/generate-routing-guide-sql.mjs`) | Queried from `lib/estimate/routingGuide.ts` by `zipcode` or `state_code` (and `geography`) |
| KB2 | ShipStation Rates API (free tier) | Live HTTPS call from `lib/estimate/shipstation.ts`, using `SHIPSTATION_API_KEY` |
| KB3 | Unisco Freight Glossary (`https://unisco.com/freight-glossary/<term>`) | Live HTTPS call from `lib/estimate/glossary.ts`, only invoked when the query contains an ambiguous/unrecognized logistics term (e.g. "what's a reefer rate to..." triggers a glossary lookup for "reefer") |

## Module interfaces

```ts
// lib/estimate/cache.ts
export async function getCachedEstimate(
  key: string, queryType: 'transit_time' | 'cost' | 'both'
): Promise<CachedEstimate | null>;

export async function upsertEstimate(
  key: string, queryType: 'transit_time' | 'cost' | 'both',
  answer: EstimateAnswer, sources: EstimateSource[]
): Promise<void>;

// lib/estimate/routingGuide.ts
export function lookupRoutingGuideEntry(zipOrState: string): RoutingGuideEntry | null;
// RoutingGuideEntry = { state, state_code, gateway_city, street_address, zipcode,
//                       corridor, distance_miles, transit_days, mode, transport,
//                       carrier, freight_cost_dollars, weight_break? }
// freight_cost_dollars is the freight cost in dollars for that ship-to/carrier,
// NOT a shipment weight -- never pass it to ShipStation as weightLbs.

// lib/estimate/shipstation.ts
export async function getRateEstimate(
  params: { toZip: string; weightLbs: number; dimsIn?: [number, number, number] }
): Promise<ShipStationRate | { error: 'unavailable' | 'timeout' }>;
// Calls POST https://api.shipstation.com/v2/rates/estimate with header
// `api-key: ${SHIPSTATION_API_KEY}`. 10s timeout.
// ESTIMATE ONLY: never call label, shipment-purchase or any endpoint that confirms
// a load to ShipStation. ShipIt only reports the best choice back to the user.
// Selected rate = cheapest total (shipping + insurance + confirmation + other amounts);
// every returned rate is still saved. Each enquiry is written to
// transportation_shipment.load_transit_freight_amount (ShipStation response + matching
// routing guide entry, newest 200 kept, first in first out).

// lib/estimate/glossary.ts
export async function lookupTerm(term: string): Promise<{ definition: string; url: string } | null>;
// GET https://unisco.com/freight-glossary/<slugified-term>; returns null on 404,
// never throws for a missing term (missing glossary entries are expected, not errors)

// lib/estimate/orchestrator.ts
export async function resolveEstimate(rawQuery: string, userId: string): Promise<EstimateResult>;
// 1. parseLocation(rawQuery) -> zipOrState | throw ValidationError
// 2. getCachedEstimate(...) -> return if hit
// 3. Promise.allSettled([lookupRoute, getRateEstimate, maybe lookupTerm])
// 4. If getRateEstimate failed/timed out: compose a transit-time-only answer,
//    note "cost estimate unavailable right now" -- never fabricate a $ figure
// 5. Call Claude (lib/ai/estimateComposer.ts) with the 3 tool results to produce
//    the final cited answer in the EstimateAnswer schema below
// 6. On a cache miss: INSERT into transportation_shipment.load_transit_freight_amount
//    (cheapest ShipStation rate + all rates + matching routing guide entry), then
//    upsertEstimate(...) into load_estimate_cache (expires_at = now() + 24 hours)
// 7. INSERT into transportation_shipment.load_estimate_enquiries
//    (userId, rawQuery, answered_from_cache, cache row id, freight row id)
// All three writes use the service role key on the server; signed-in users can only read.
```

## Data shapes

```ts
type EstimateAnswer = {
  summary: string;              // one-sentence human-readable answer
  transit_days: number | null;
  carrier: string | null;
  corridor: string | null;
  usd_estimate: number | null;  // null if KB2 unavailable
  currency: 'USD';
};

type EstimateSource = {
  kb: 'routing_guide' | 'shipstation' | 'unisco_glossary';
  detail: string;               // e.g. "ShipStation rate_id abc123" or "Routing_Guide.json GA row"
};

type CachedEstimate = { answer: EstimateAnswer; sources: EstimateSource[]; created_at: string };
```

## API contract

### `POST /api/estimate`

Request:
```json
{ "query": "what's the estimate to zip 30303" }
```

Response (200, cache hit):
```json
{
  "cached": true,
  "answer": { "summary": "...", "transit_days": 1, "carrier": "Norfolk Southern", "corridor": "I-22 E to I-20 E", "usd_estimate": 184.50, "currency": "USD" },
  "sources": [{ "kb": "routing_guide", "detail": "Routing_Guide.json GA row" }, { "kb": "shipstation", "detail": "rate_id se-1234" }]
}
```

Response (200, cache miss, KB2 failed):
```json
{
  "cached": false,
  "answer": { "summary": "Transit estimate only -- cost estimate unavailable right now.", "transit_days": 1, "carrier": "Norfolk Southern", "corridor": "I-22 E to I-20 E", "usd_estimate": null, "currency": "USD" },
  "sources": [{ "kb": "routing_guide", "detail": "Routing_Guide.json GA row" }]
}
```

Errors: `400` (no parseable zip/state in query), `401` (unauthenticated), `500` (unexpected).

### `GET /api/estimate/history`

Response:
```json
{ "items": [{ "raw_query": "...", "created_at": "...", "answer": { ... } }] }
```

## Component spec

- `app/(app)/estimate/page.tsx` — chat input (`<EstimateInput>`) + scrollable answer list (`<EstimateAnswerCard>`)
- `<EstimateAnswerCard>` renders `usd_estimate` and `transit_days` using `docs/design.md`'s `Data/Mono` type role (14px/20px, JetBrains Mono). A cache-miss (freshly computed) answer gets a small `Blue 50`-background "Freshly calculated" tag; a cache-hit answer gets no tag.
- Loading state: while awaiting the backend, show the standard loading skeleton plus the text "Checking knowledge bases..." (no custom spinner — use `docs/design.md`'s existing loading pattern).
- Citations render as a small `<SourceList>` under the answer, each item `Paragraph Small Regular`, linking out where the KB has a real URL (KB3 only; KB1/KB2 have no public URL to link).

## State management

TanStack Query mutation for `POST /api/estimate` (not a GET-cached query, since the backend itself is the cache); a separate `useQuery` for `GET /api/estimate/history` keyed `['estimate-history']`.

## Edge cases

- No parseable zip/state in the query → `400`, frontend shows "Please include a US zip code or state name."
- ShipStation (KB2) times out (>10s) or errors → fall back to transit-time-only answer; never fabricate a dollar figure
- Zip not covered by `Routing_Guide.json` → return "No routing data for this location yet," not a 500
- Two users query the same zip simultaneously on a cold cache → `UNIQUE(geography, zip_or_state, query_type)` + `ON CONFLICT DO UPDATE` (see `supabase/load_estimate_cache_and_enquiries.sql`) — last write wins, no duplicate rows, no unique-constraint error surfaced to either user
