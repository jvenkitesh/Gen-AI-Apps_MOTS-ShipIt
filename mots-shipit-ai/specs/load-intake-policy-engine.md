# Spec — Load Intake & Policy Engine (C1 + C2)

The **Policy engine** checks every load the TMS sends against the customer's active **sourcing policy** — the guardrails set by the Supply Chain Operations Manager (allowed lanes, equipment, rate range) — before any carrier is contacted.

## User flow

1. The TMS sends a webhook to `POST /api/loads/webhook` with a sourcing-ready load.
2. `lib/freight/loadIntake.ts` validates the payload, then calls `transportation_shipment.ingest_load()` which atomically creates the load, creates a new **version** when the TMS changed its terms, or reports it unchanged.
3. `lib/freight/policyEngine.ts` evaluates the load against the customer's active `operational_excellence_governance.sourcing_policies` row:
   - passes every rule → load `status = 'sourcing'`
   - fails a rule, or no active policy → load `status = 'exception'` and an `operational_excellence_governance.operational_exceptions` row (`trigger_type` `policy_ineligible` or `no_active_policy`, 4-hour SLA). A missing or empty policy setting never means "no constraints".

## Tables (SQL: `supabase/loads_customers_policies_exceptions.sql`)

- `master_data_management.customers`
- `operational_excellence_governance.sourcing_policies` — one `active` policy per customer; `eligible_lanes` `[{"origin_state":"TN","destination_state":"*"}]`, `eligible_equipment` `["dry_van","reefer"]`, `rate_bounds` `{"minimum_dollars":500,"maximum_dollars":5000}`
- `transportation_shipment.loads` — versioned per `external_id`, stores the eligibility result (`eligibility_reason_codes`, `evaluated_policy_id/version`, `evaluated_at`)
- `operational_excellence_governance.operational_exceptions`

## Module interfaces

```ts
// lib/freight/loadIntake.ts
export async function ingestLoad(admin: SupabaseClient, payload: TmsLoadPayload): Promise<IngestOutcome>;
// IngestOutcome = { loadId, version, outcome: 'created' | 'new_version' | 'unchanged', status, eligibility }

// lib/freight/policyEngine.ts
export function evaluateAgainstPolicy(load: LoadForEvaluation, policy: SourcingPolicy | null): EligibilityResult;
// EligibilityResult = { eligible: boolean; reasonCodes: string[] }
// Reason codes: NO_ACTIVE_POLICY, NO_LANES_CONFIGURED, LANE_NOT_ELIGIBLE, UNKNOWN_LANE_STATE,
// NO_EQUIPMENT_CONFIGURED, EQUIPMENT_NOT_ELIGIBLE, RATE_BOUNDS_NOT_SET,
// TARGET_RATE_BELOW_MINIMUM, RATE_CEILING_ABOVE_MAXIMUM
```

Expiring `carrier_offers` tied to an old load version is wired in Feature 5 (negotiation), when that table exists.

## Webhook payload (Zod, `tmsLoadPayloadSchema` in `lib/freight/loadIntake.ts`)

```ts
{
  external_id: string,              // TMS's own load id, used for de-dup/versioning
  customer_id: uuid,                // master_data_management.customers.id
  origin_zipcode: "38103",          // 5 digits; state derived server-side
  destination_zipcode: "30303",
  equipment_type: "dry_van" | "reefer",
  scheduled_pickup_at: ISO datetime,
  scheduled_delivery_at: ISO datetime,   // >= pickup
  commodity: string,
  weight_pounds: number > 0,
  target_rate_dollars: number > 0,
  rate_ceiling_dollars: number > 0,      // >= target rate
}
```

## API contract

### `POST /api/loads/webhook`

Auth: service-to-service. Header `X-TMS-Webhook-Secret` compared against `TMS_WEBHOOK_SECRET` in constant time. Not a signed-in user request. Needs `SUPABASE_SERVICE_ROLE_KEY`.

- `201` created / `200` new version or unchanged: `{ "load_id", "version", "outcome", "status", "eligible", "reason_codes" }`
- `400` validation failure (`field`, `message`) or `UNKNOWN_CUSTOMER`; `401` bad/missing secret; `503` not configured; `500` unexpected

### `GET /api/loads`

Auth: any signed-in role (assignment model is out of MVP scope). Query params: `status`, `customer_id`. Response: `{ "items": [LoadRow] }`.

## Component spec

- `app/(app)/loads/page.tsx` — status filter + data-dense table (status, load id + version, customer, lane, equipment, weight, target rate, rate ceiling, pickup, received). Every column label ends with an ⓘ definition.
- Status badges: sourcing = Blue, negotiating = Yellow, booked = Green, exception = Saffron, cancelled = Red.
- `app/(app)/loads/[id]/page.tsx` — load fields, Policy engine eligibility (reason codes in plain language), the sourcing policy version it was checked against, the load's exceptions, and a placeholder for carrier candidates/offers.
- Loading states use the shared "Transmogrifying…" indicator.

## Edge cases

- Payload missing a field → `400`, nothing written (validation happens before any insert).
- Same `external_id`, identical terms → `unchanged`, version kept, no duplicate exception.
- Same `external_id`, changed terms → `new_version`, re-evaluated; exceptions record the version.
- Unknown `customer_id` → `400 UNKNOWN_CUSTOMER`.
- No active policy → load stored with `status = 'exception'` (`no_active_policy`).
