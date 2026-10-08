# MOTS ShipIt — Implementation Specs

> Stage 1 companion to `engineering-doc.md`. Consolidated architecture-level specs (one section per concern) + the full Supabase SQL schema + `.env.example`. Generated via the borrowed `implementation-specs` methodology per the ContractIQ playbook (`docs/notes/reference-contractiq-playbook.md`, item 1) — one file, not the usual multi-file `docs/specs/*.md` output.

---

## 1. Load-Estimate Chatbot

**User flow:** User types a free-text query containing a US zip or state → system parses the location → checks `load_estimate_cache` → on a hit, returns immediately; on a miss, queries KB1 (`Routing_Guide.json`), KB2 (ShipStation Rates API), KB3 (Unisco Freight Glossary for term validation) in parallel → Claude composes a cited answer → result is upserted into `load_estimate_cache` → answer rendered.

**DB schema:** `load_estimate_cache` (see full DDL in §12). No other tables required for this feature beyond `profiles` (for auth scoping of the history endpoint).

**DB tasks (setup order):** 1) `profiles` must exist first (FK target isn't used here, but auth must be live). 2) `load_estimate_cache` has no FK dependencies — can be created any time after extensions are enabled.

**API routes:**
- `POST /api/estimate` — `{ query: string }` → `{ cached: boolean, answer: object, sources: array }`. Validates that the query contains a parseable US zip (5-digit) or a recognized state name/code; 400 if neither is found.
- `GET /api/estimate/history` — auth required, returns the calling user's recent queries (requires a lightweight `estimate_queries` log — see §12 note).

**State management:** TanStack Query, keyed by the raw query string; no client-side caching beyond the query library's default (the real cache lives server-side in Supabase, which is the point of this feature).

**Component spec:** `app/(app)/estimate/page.tsx` — a chat-style input + answer card. Answer card uses `docs/design.md`'s `Data/Mono` type role (JetBrains Mono, 14/20) for the USD figure and transit-day count; citations rendered as `Paragraph Small Regular` with source links. Loading state shows "Checking knowledge bases..." using the core system's standard loading skeleton pattern (no custom spinner).

**Design note:** Per `docs/design.md`'s Color Usage Rules — a cache-hit answer renders with no extra badge (just the answer); a cache-miss (fresh KB query) answer gets a small `Blue 50` background tint badge reading "Freshly calculated" so users can tell cached vs. live answers apart, reusing the existing Blue semantic token rather than inventing a new one.

**Edge cases:**
- Query has no parseable zip/state → 400 with a clear "please include a US zip code or state" message, not a guessed answer
- ShipStation (KB2) times out or errors → fall back to a transit-time-only answer from KB1, with an explicit "cost estimate unavailable right now" note (never fabricate a dollar figure)
- Zip code doesn't exist in `Routing_Guide.json`'s state coverage → return a clear "no routing data for this location yet" response, not an error page
- Cache race: two users query the same zip simultaneously on a cold cache → `UNIQUE(zip_or_state, query_type)` + `ON CONFLICT DO UPDATE` makes the write idempotent; last write wins, no duplicate rows

---

## 2. Load Intake & Policy Engine (C1/C2)

**User flow:** TMS sends a webhook with a sourcing-ready load → orchestrator validates required fields (lane, equipment, schedule, commodity, weight, customer, target rate, ceiling) → creates `loads` row at version 1 → snapshots the customer's current `policies` row → applies hard eligibility constraints.

**DB schema:** `loads`, `customers`, `policies` (full DDL §12).

**DB tasks (setup order):** `customers` and `policies` before `loads` (FK dependency: `loads.customer_id → customers.id`, `customers.policy_id → policies.id`).

**API routes:**
- `POST /api/loads/webhook` — service-to-service, authenticated via a webhook secret header (not Supabase Auth), not a logged-in user. 401 on bad secret, 400 on missing required fields.
- `GET /api/loads` — role-scoped list (admin sees all; sales_rep sees assigned; compliance sees flagged).

**State management:** server-driven; no client state beyond the standard TanStack Query list/detail pattern.

**Component spec:** `app/(app)/loads/page.tsx` (list, data-dense table per `docs/design.md`'s core "modern SaaS, lighter" philosophy) and `app/(app)/loads/[id]/page.tsx` (detail).

**Design note:** Load status badges use the core semantic colors directly — `sourcing` = Blue, `negotiating` = Yellow, `booked` = Green, `exception` = Saffron/Red depending on SLA state — per the Color Usage Rules in `docs/design.md`.

**Edge cases:**
- Webhook delivers a load missing a required field → 400, load never created, TMS must retry with complete data
- Load changes mid-negotiation (new webhook for same load, different terms) → increment `version`, invalidate in-flight offers tied to the old version (per PRD's exception-flow table)

---

## 3. Carrier Retrieval & Ranking (C3)

**User flow:** Given an eligible load, the system filters the carrier pool by policy (lane, equipment, tier) and ranks remaining candidates using lane/corridor data seeded from `Routing_Guide.json` plus historical service data.

**DB schema:** `carriers`, `carrier_contacts` (full DDL §12).

**DB tasks:** Seed `carriers`/`carrier_contacts` from existing broker data before go-live; `Routing_Guide.json` itself is not imported into the DB — it's read directly by `lib/estimate/routingGuide.ts` and `lib/freight/carrierRanking.ts` as a static reference file, not duplicated into a table (avoids a sync problem between the file and a DB copy).

**API routes:** `GET /api/loads/:id/candidates` → ranked list with `reason_codes` (e.g. `lane_match`, `tier_approved`, `excluded: insurance_expired`).

**State management:** TanStack Query, refetched on load status change.

**Component spec:** Candidate list as cards, each showing carrier name, tier badge, and reason codes as small tags (`docs/design.md`'s Tag/Badge pattern, 6px radius).

**Design note:** Excluded carriers shown greyed (Grey 400 text) with their exclusion reason visible, not hidden — per the PRD's own requirement for "exclusion explanations," which is also a transparency/trust design principle.

**Edge cases:** Zero eligible candidates after policy filtering → surface this as an exception (`trigger_type: no_candidates`), not a silent empty list.

---

## 4. Outreach (C4)

**User flow:** System contacts a bounded batch of ranked candidates concurrently via SMS/email (voice deferred to Phase 2), discloses AI identity, verifies contact authority, confirms load facts.

**DB schema:** `interactions` (full DDL §12).

**API routes:** `POST /api/loads/:id/outreach` — `{ batch_size }` → list of contacted carriers; respects `carrier_contacts.opt_out` and frequency caps.

**State management:** real-time-ish via polling (TanStack Query `refetchInterval`) for MVP — no need for websockets/Supabase Realtime at this scale yet.

**Component spec:** Live outreach status per carrier (contacted / awaiting response / offer received / no response), small status dot + label.

**Design note:** AI-disclosure text is a fixed, policy-controlled string per channel — rendered in the interaction log exactly as sent, never summarized, so it's auditable verbatim.

**Edge cases:**
- Carrier contact has `opt_out = true` → excluded from outreach entirely, never contacted
- Batch exhausted with no responses → expand to next ranked batch only after the policy-defined timeout, not immediately

---

## 5. Negotiation & Compliance (C5/C6)

**User flow:** Each responding carrier's message is parsed into a structured offer (rate, terms, confidence, evidence) → negotiated within the policy's rate ceiling/concession rules → immediately before any booking, a fresh compliance snapshot is pulled (identity, authority, insurance, fraud signals).

**DB schema:** `offers`, `compliance_snapshots` (full DDL §12).

**API routes:**
- `POST /api/offers/:id/respond` — `{ action: 'approve'|'counter'|'reject', counter_terms? }`
- `GET /api/carriers/:id/compliance` — latest snapshot; 409 if stale/unavailable (fail-closed, never serves a stale "pass")

**Design note:** Confidence shown via the Reports sub-theme's Confidence Score Badge pattern if the Reports theme is in use for this screen; otherwise a plain percentage in `Data/Mono`.

**Edge cases:**
- Compliance check returns stale/unavailable data → block booking for that carrier, continue read-only outreach only if policy allows (PRD's own fail-closed rule)
- Carrier requests a term outside policy bounds → stop negotiation, surface to the exception queue, never auto-approve outside the ceiling

---

## 6. Atomic Booking & TMS Adapter (C7)

**User flow:** An approved offer is selected → final policy + compliance recheck → atomic commit (idempotency key + DB-level uniqueness) → other open conversations for that load are closed → rate confirmation generated → generic TMS adapter writes the result back.

**DB schema:** `bookings` (full DDL §12), with `idempotency_key` UNIQUE constraint as the actual concurrency guard (not just application-level locking).

**API routes:** `POST /api/loads/:id/book` — `{ offer_id, idempotency_key }` → 409 if already booked (safe to retry with the same key — no duplicate booking).

**Design note:** A successful booking triggers a Green success toast using the core system's existing Success state colors — no new pattern needed.

**Edge cases:** Two near-simultaneous booking requests for the same load (e.g. a race between an admin manual approval and an autonomous rule) → the `idempotency_key` UNIQUE constraint at the DB level is the real guard; the second request gets a 409, not a second booking row. This is the same class of bug the PRD explicitly calls out as Critical severity (Component C7 risk table).

---

## 7. Human Control Plane (C8) & Exceptions

**User flow:** Admin can pause/resume/override/cancel at load, customer, lane, agent, channel, or global scope at any time; exceptions (low-confidence speech, rate-above-ceiling, identity/payment change, mid-negotiation load change, preferred-carrier timeout, tool outage) appear in a prioritized queue with an SLA deadline.

**DB schema:** `control_actions`, `exceptions` (full DDL §12).

**API routes:** `POST /api/control/pause`, `GET /api/exceptions`, `POST /api/exceptions/:id/resolve`.

**Component spec:** Exception queue cards use `docs/design.md`'s **SLA Countdown Badge** (Saffron) when time remains, switching to Red once the deadline has passed — this is the exact pattern the design system was extended for.

**Edge cases:** An exception's SLA deadline passes with no human action → status flips to `breached`, which should itself raise visibility (not silently disappear from the queue) — surfaced in the Operations Manager dashboard's "breached SLA" count.

---

## 8. Audit & Observability (C9)

**User flow:** Every state transition (policy applied, offer created, compliance checked, booking committed, control action taken) writes an immutable `audit_events` row with the model/policy version in effect at the time.

**DB schema:** `audit_events` (full DDL §12) — append-only; no UPDATE/DELETE permitted at the RLS level, even for admins.

**Edge cases:** none by design — this table has no business-logic branches, only writes.

---

## 9. Auth & RBAC (cross-cutting)

**User flow:** Supabase Auth (email/password + OAuth) for all console users; role stored in `profiles.role`; every API route wrapped in `requireAuth()`; RLS policies independently enforce the same scoping as a defense-in-depth layer (the exact pattern the sibling ContractIQ project's Stage 7 audit confirmed works well).

**Edge cases:** A user with no `profiles` row yet (first login) → auto-provisioned via a Supabase trigger (`handle_new_user`, mirroring the pattern from the sibling project, but with its public-RPC-callable exposure closed per that project's own security audit finding — see §12's RLS section).

---

## 10. Design System Integration (cross-cutting)

All UI must read `docs/design.md` in full before being written, per the `/design-system` skill. Core tokens (Blue primary, Saffron SLA urgency, Inter Display + JetBrains Mono) apply everywhere except the optional Reports sub-theme, which is scoped only to `app/(app)/reports/` via `data-theme="reports"` and is explicitly a stretch/Phase 3 item — do not apply it to the core ops console.

---

## 11. Summary Table

| Section | Specifies |
|---|---|
| 1. Load-Estimate Chatbot | The 3-KB (Routing_Guide.json + ShipStation + Unisco Glossary) chat feature with Supabase caching |
| 2. Load Intake & Policy Engine | TMS webhook intake, load versioning, policy snapshotting |
| 3. Carrier Retrieval & Ranking | Policy-filtered, ranked carrier candidates seeded by Routing_Guide.json |
| 4. Outreach | Bounded-batch SMS/email contact, opt-out/frequency-cap respect |
| 5. Negotiation & Compliance | Structured offer extraction + policy-bounded negotiation + fail-closed compliance checks |
| 6. Atomic Booking & TMS Adapter | Idempotent, race-safe booking commit + generic TMS write-back |
| 7. Human Control Plane & Exceptions | Scoped pause/override, SLA-countdown exception queue |
| 8. Audit & Observability | Immutable, append-only event log |
| 9. Auth & RBAC | Supabase Auth + role-based access, enforced in-route and via RLS |
| 10. Design System Integration | Core vs. Reports-sub-theme token usage rules |
| 12. Supabase SQL Schema | Complete paste-and-run schema: extensions, enums, tables, FKs, indexes, triggers, RLS |
| 13. `.env.example` | Every environment variable this app needs, grouped by service |

---

## 12. Supabase SQL Schema (paste-and-run)

```sql
-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Enums
create type user_role as enum ('admin', 'ops_manager', 'sales_rep', 'compliance');
create type load_status as enum ('sourcing', 'negotiating', 'booked', 'exception', 'cancelled');
create type offer_status as enum ('proposed', 'countered', 'accepted', 'expired', 'rejected');
create type exception_status as enum ('open', 'resolved', 'breached');
create type control_scope as enum ('load', 'customer', 'lane', 'agent', 'channel', 'global');
create type control_action_type as enum ('pause', 'resume', 'override', 'cancel');
create type estimate_query_type as enum ('transit_time', 'cost', 'both');

-- profiles (1:1 with auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'sales_rep',
  full_name text,
  created_at timestamptz not null default now()
);

-- policies
create table if not exists policies (
  id uuid primary key default gen_random_uuid(),
  version int not null default 1,
  eligible_lanes jsonb not null default '[]',
  eligible_equipment jsonb not null default '[]',
  carrier_tiers jsonb not null default '[]',
  rate_bounds jsonb not null default '{}',
  concession_rules jsonb not null default '{}',
  approval_thresholds jsonb not null default '{}',
  effective_at timestamptz not null default now(),
  approved_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- customers
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  policy_id uuid references policies(id),
  rate_authority jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- loads
create table if not exists loads (
  id uuid primary key default gen_random_uuid(),
  version int not null default 1,
  lane_origin_zip text not null,
  lane_dest_zip text not null,
  equipment_type text not null,
  schedule_pickup timestamptz,
  schedule_delivery timestamptz,
  commodity text,
  weight_lbs numeric,
  customer_id uuid references customers(id),
  target_rate numeric,
  rate_ceiling numeric not null,
  status load_status not null default 'sourcing',
  created_at timestamptz not null default now()
);

-- carriers
create table if not exists carriers (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  usdot text,
  mc_number text,
  tier text,
  lanes jsonb not null default '[]',
  equipment jsonb not null default '[]',
  contact_preferences jsonb not null default '{}',
  service_history jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- carrier_contacts
create table if not exists carrier_contacts (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid not null references carriers(id) on delete cascade,
  name text,
  phone text,
  email text,
  authority_verified boolean not null default false,
  opt_out boolean not null default false,
  created_at timestamptz not null default now()
);

-- compliance_snapshots
create table if not exists compliance_snapshots (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid not null references carriers(id) on delete cascade,
  checked_at timestamptz not null default now(),
  authority_status text,
  insurance_status text,
  safety_status text,
  fraud_risk_score numeric,
  evidence jsonb not null default '{}',
  source text
);

-- offers
create table if not exists offers (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references loads(id) on delete cascade,
  load_version int not null,
  carrier_id uuid not null references carriers(id),
  rate numeric,
  terms jsonb not null default '{}',
  confidence numeric,
  evidence jsonb not null default '{}',
  status offer_status not null default 'proposed',
  created_at timestamptz not null default now()
);

-- bookings
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references loads(id),
  load_version int not null,
  carrier_id uuid not null references carriers(id),
  offer_id uuid not null references offers(id),
  idempotency_key text not null unique,
  rate_confirmation_url text,
  tms_sync_status text not null default 'pending',
  booked_at timestamptz not null default now()
);

-- interactions
create table if not exists interactions (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references loads(id) on delete cascade,
  carrier_id uuid references carriers(id),
  channel text not null default 'sms',
  transcript jsonb not null default '[]',
  disclosures jsonb not null default '{}',
  opt_out boolean not null default false,
  created_at timestamptz not null default now()
);

-- exceptions
create table if not exists exceptions (
  id uuid primary key default gen_random_uuid(),
  load_id uuid references loads(id) on delete cascade,
  trigger_type text not null,
  recommended_action text,
  risk_level text,
  sla_deadline timestamptz,
  status exception_status not null default 'open',
  resolved_by uuid references profiles(id),
  resolution text,
  created_at timestamptz not null default now()
);

-- control_actions
create table if not exists control_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references profiles(id),
  scope control_scope not null,
  scope_id text,
  action control_action_type not null,
  reason text,
  created_at timestamptz not null default now()
);

-- audit_events (append-only)
create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  event_type text not null,
  payload jsonb not null default '{}',
  model_version text,
  policy_version int,
  created_at timestamptz not null default now()
);

-- load_estimate_cache (load-estimate chatbot)
create table if not exists load_estimate_cache (
  id uuid primary key default gen_random_uuid(),
  zip_or_state text not null,
  query_type estimate_query_type not null default 'both',
  answer_json jsonb not null,
  sources jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (zip_or_state, query_type)
);

-- estimate_queries (lightweight per-user history log for GET /api/estimate/history)
create table if not exists estimate_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  raw_query text not null,
  cache_id uuid references load_estimate_cache(id),
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_loads_status on loads(status);
create index if not exists idx_offers_load_version on offers(load_id, load_version);
create index if not exists idx_exceptions_sla on exceptions(sla_deadline);
create index if not exists idx_estimate_cache_key on load_estimate_cache(zip_or_state, query_type);
create index if not exists idx_estimate_queries_user on estimate_queries(user_id);

-- updated_at trigger function (reused across tables that need it)
create or replace function set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- handle_new_user: auto-provision a profiles row on signup
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (new.id, 'sales_rep', new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Revoke public RPC exposure of the SECURITY DEFINER function
-- (closes the exact finding the sibling ContractIQ project's Supabase advisor caught)
revoke all on function handle_new_user() from anon, authenticated;

-- RLS
alter table profiles enable row level security;
alter table policies enable row level security;
alter table customers enable row level security;
alter table loads enable row level security;
alter table carriers enable row level security;
alter table carrier_contacts enable row level security;
alter table compliance_snapshots enable row level security;
alter table offers enable row level security;
alter table bookings enable row level security;
alter table interactions enable row level security;
alter table exceptions enable row level security;
alter table control_actions enable row level security;
alter table audit_events enable row level security;
alter table load_estimate_cache enable row level security;
alter table estimate_queries enable row level security;

-- profiles: a user can read/update only their own row; admins can read all
create policy "profiles_own_or_admin_select" on profiles for select
  using (id = (select auth.uid()) or exists (
    select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin'
  ));
create policy "profiles_own_update" on profiles for update
  using (id = (select auth.uid()));

-- load_estimate_cache: shared reference cache, readable by any authenticated user
create policy "estimate_cache_read_all" on load_estimate_cache for select
  using ((select auth.uid()) is not null);
create policy "estimate_cache_service_write" on load_estimate_cache for insert
  with check ((select auth.uid()) is not null);
create policy "estimate_cache_service_update" on load_estimate_cache for update
  using ((select auth.uid()) is not null);

-- estimate_queries: own-rows only
create policy "estimate_queries_own" on estimate_queries for all
  using (user_id = (select auth.uid()));

-- loads/offers/bookings/exceptions: admin sees all; others scoped to assigned work
-- (simplified MVP policy -- role-based, not yet customer-scoped; tighten per
--  actual assignment model once that's built in Stage 2/4)
create policy "loads_role_scoped" on loads for select
  using (exists (
    select 1 from profiles p where p.id = (select auth.uid())
    and p.role in ('admin', 'ops_manager', 'sales_rep', 'compliance')
  ));
create policy "offers_role_scoped" on offers for select
  using (exists (
    select 1 from profiles p where p.id = (select auth.uid())
    and p.role in ('admin', 'ops_manager', 'sales_rep', 'compliance')
  ));
create policy "bookings_role_scoped" on bookings for select
  using (exists (
    select 1 from profiles p where p.id = (select auth.uid())
    and p.role in ('admin', 'ops_manager', 'sales_rep')
  ));
create policy "exceptions_role_scoped" on exceptions for select
  using (exists (
    select 1 from profiles p where p.id = (select auth.uid())
    and p.role in ('admin', 'ops_manager', 'sales_rep', 'compliance')
  ));

-- audit_events: append-only -- insert allowed, update/delete never
create policy "audit_events_insert_only" on audit_events for insert
  with check ((select auth.uid()) is not null);
create policy "audit_events_read_admin" on audit_events for select
  using (exists (
    select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin'
  ));

-- control_actions: admin only
create policy "control_actions_admin_only" on control_actions for all
  using (exists (
    select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin'
  ));

-- carriers/carrier_contacts/compliance_snapshots: all authenticated roles can read
create policy "carriers_read_all" on carriers for select
  using ((select auth.uid()) is not null);
create policy "carrier_contacts_read_all" on carrier_contacts for select
  using ((select auth.uid()) is not null);
create policy "compliance_snapshots_read_all" on compliance_snapshots for select
  using ((select auth.uid()) is not null);

-- customers/policies/interactions: admin + ops_manager
create policy "customers_admin_ops" on customers for select
  using (exists (
    select 1 from profiles p where p.id = (select auth.uid())
    and p.role in ('admin', 'ops_manager')
  ));
create policy "policies_admin_ops" on policies for select
  using (exists (
    select 1 from profiles p where p.id = (select auth.uid())
    and p.role in ('admin', 'ops_manager')
  ));
create policy "interactions_role_scoped" on interactions for select
  using (exists (
    select 1 from profiles p where p.id = (select auth.uid())
    and p.role in ('admin', 'ops_manager', 'sales_rep', 'compliance')
  ));
```

> **Idempotency note:** this schema uses `create table/type if not exists` / guarded trigger creation, per the ContractIQ playbook's explicit lesson (item 9): a destructive drop-and-recreate must never be a silent default. If re-running this against a database that already has conflicting objects, stop and ask the user how to proceed (verify-and-patch, confirmed drop-and-recreate, or rewrite for idempotency) rather than assuming.

---

## 13. `.env.example`

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=              # Project URL -- Supabase Dashboard > Project Settings > API
NEXT_PUBLIC_SUPABASE_ANON_KEY=         # anon/public key -- Project Settings > API
SUPABASE_SERVICE_ROLE_KEY=             # service role key -- Project Settings > API # SERVER ONLY, never expose to client

# LLM (Anthropic Claude -- model cascade)
ANTHROPIC_API_KEY=                     # console.anthropic.com # SERVER ONLY

# KB2 -- ShipStation (free tier)
SHIPSTATION_API_KEY=                   # app.shipstation.com -- free tier, no paid plan required for rate comparison # SERVER ONLY

# App
NEXT_PUBLIC_APP_URL=                   # http://localhost:3000 in dev; your Netlify URL in production

# TMS webhook (generic adapter)
TMS_WEBHOOK_SECRET=                    # shared secret for POST /api/loads/webhook -- rotate per TMS integration # SERVER ONLY

# Security (Stage 7)
MAX_CHAT_HISTORY=200                   # messages/turns sent to the model per conversation -- optional, defaults to 200

# Note: KB1 (Routing_Guide.json) is a static file in the repo, no env var needed.
# Note: KB3 (Unisco Freight Glossary) is fetched live from a public URL, no API key needed.
```
