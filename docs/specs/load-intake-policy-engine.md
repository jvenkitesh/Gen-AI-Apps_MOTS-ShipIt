# Spec — Load Intake & Policy Engine (C1 + C2)

## User flow

1. TMS sends a webhook to `POST /api/loads/webhook` with a sourcing-ready load payload.
2. `lib/freight/loadIntake.ts` validates required fields, creates/updates the `loads` row (versioned), and resolves the customer's active `policies` row.
3. `lib/freight/policyEngine.ts` evaluates hard eligibility constraints (lane, equipment, carrier tier gates) against that policy and marks the load `sourcing`-eligible or raises an `exceptions` row (`trigger_type: policy_ineligible`).

## Module interfaces

```ts
// lib/freight/loadIntake.ts
export async function ingestLoad(payload: TmsLoadPayload): Promise<{ loadId: string; version: number }>;
// Validates via Zod schema (below). If a load with this TMS external id already
// exists, increments `version` instead of creating a new row, and invalidates
// any `offers` rows tied to the prior version (status -> 'expired').

// lib/freight/policyEngine.ts
export async function evaluateEligibility(loadId: string): Promise<EligibilityResult>;
// EligibilityResult = { eligible: boolean; reasonCodes: string[] }
```

## Validation schema (Zod, inline in the route per project convention)

```ts
const TmsLoadPayload = z.object({
  external_id: z.string(),            // TMS's own load identifier, used for de-dup/versioning
  lane_origin_zip: z.string().regex(/^\d{5}$/),
  lane_dest_zip: z.string().regex(/^\d{5}$/),
  equipment_type: z.enum(['dry_van', 'reefer']),
  schedule_pickup: z.string().datetime(),
  schedule_delivery: z.string().datetime(),
  commodity: z.string(),
  weight_lbs: z.number().positive(),
  customer_id: z.string().uuid(),
  target_rate: z.number().positive(),
  rate_ceiling: z.number().positive(),
});
```

## API contract

### `POST /api/loads/webhook`

Auth: service-to-service. Header `X-TMS-Webhook-Secret` compared against `TMS_WEBHOOK_SECRET` (constant-time comparison). **Not** a Supabase-authenticated user request.

Request: `TmsLoadPayload` (above).

Response (201 new load):
```json
{ "load_id": "uuid", "version": 1, "status": "sourcing" }
```

Response (200, existing load updated):
```json
{ "load_id": "uuid", "version": 2, "status": "sourcing", "invalidated_offers": 3 }
```

Errors: `401` bad/missing secret, `400` Zod validation failure (body lists the failing field).

### `GET /api/loads`

Auth: required (any role). Query params: `status`, `customer_id`. Role-scoped (admin: all; others: per assignment — assignment model is out of scope for MVP, so for now all authenticated roles see all loads; tighten later).

Response: `{ "items": [{ "id", "status", "lane_origin_zip", "lane_dest_zip", "equipment_type", "target_rate", "created_at" }] }`

## Component spec

- `app/(app)/loads/page.tsx` — data-dense table (per `docs/design.md`'s core philosophy), columns: status badge, lane, equipment, target rate, created.
- Status badge colors: `sourcing` = Blue, `negotiating` = Yellow, `booked` = Green, `exception` = Saffron/Red (per `docs/design.md` Color Usage Rules).
- `app/(app)/loads/[id]/page.tsx` — load detail: policy snapshot, candidate list (links to carrier-ranking spec), offers, compliance status.

## Edge cases

- Webhook delivers a payload missing a required field → `400`, load never created, TMS must retry with complete data (no partial row left behind — validate before any INSERT)
- Load changes mid-negotiation (new webhook for the same `external_id`, different terms) → increment `version`; any `offers` tied to the old version flip to `expired`; if a carrier had already verbally accepted under the old version, this surfaces as an exception (`trigger_type: load_changed_post_acceptance`) rather than silently discarding
- No active `policies` row for the load's customer → load created but held at `status: 'exception'` (`trigger_type: no_active_policy`) — never defaults to "no constraints"
