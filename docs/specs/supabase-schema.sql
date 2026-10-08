-- MOTS ShipIt — Supabase schema
-- Paste-and-run in the Supabase SQL Editor on a fresh project.
-- Idempotent (IF NOT EXISTS / guarded) per the ContractIQ playbook's explicit
-- lesson: a destructive drop-and-recreate must never be a silent default.
-- No storage bucket: this app has no file-upload requirement (unlike the
-- sibling ContractIQ project).

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Enums
do $$ begin
  create type user_role as enum ('admin', 'ops_manager', 'sales_rep', 'compliance');
exception when duplicate_object then null; end $$;

do $$ begin
  create type load_status as enum ('sourcing', 'negotiating', 'booked', 'exception', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type offer_status as enum ('proposed', 'countered', 'accepted', 'expired', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type exception_status as enum ('open', 'resolved', 'breached');
exception when duplicate_object then null; end $$;

do $$ begin
  create type control_scope as enum ('load', 'customer', 'lane', 'agent', 'channel', 'global');
exception when duplicate_object then null; end $$;

do $$ begin
  create type control_action_type as enum ('pause', 'resume', 'override', 'cancel');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estimate_query_type as enum ('transit_time', 'cost', 'both');
exception when duplicate_object then null; end $$;

-- ===== Tables, in dependency order =====

-- profiles (1:1 with auth.users) -- no FK dependency on any other app table
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'sales_rep',
  full_name text,
  created_at timestamptz not null default now()
);

-- policies -- depends on profiles (approved_by)
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

-- customers -- depends on policies
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  policy_id uuid references policies(id),
  rate_authority jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- loads -- depends on customers
create table if not exists loads (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,              -- TMS's own load identifier, for de-dup/versioning
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- carriers -- no FK dependency
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

-- carrier_contacts -- depends on carriers
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

-- compliance_snapshots -- depends on carriers
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

-- offers -- depends on loads, carriers
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

-- bookings -- depends on loads, carriers, offers
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

-- interactions -- depends on loads, carriers
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

-- exceptions -- depends on loads, profiles
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

-- control_actions -- depends on profiles
create table if not exists control_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references profiles(id),
  scope control_scope not null,
  scope_id text,
  action control_action_type not null,
  reason text,
  created_at timestamptz not null default now()
);

-- audit_events -- no FK dependency (entity_id is a loose reference by design,
-- since it points at rows across many different tables)
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

-- load_estimate_cache -- no FK dependency
create table if not exists load_estimate_cache (
  id uuid primary key default gen_random_uuid(),
  zip_or_state text not null,
  query_type estimate_query_type not null default 'both',
  answer_json jsonb not null,
  sources jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (zip_or_state, query_type)
);

-- estimate_queries -- depends on profiles, load_estimate_cache
create table if not exists estimate_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  raw_query text not null,
  cache_id uuid references load_estimate_cache(id),
  created_at timestamptz not null default now()
);

-- ===== Indexes =====
create index if not exists idx_loads_status on loads(status);
create index if not exists idx_loads_external_id on loads(external_id);
create index if not exists idx_offers_load_version on offers(load_id, load_version);
create index if not exists idx_exceptions_sla on exceptions(sla_deadline);
create index if not exists idx_estimate_cache_key on load_estimate_cache(zip_or_state, query_type);
create index if not exists idx_estimate_queries_user on estimate_queries(user_id);
create index if not exists idx_compliance_snapshots_carrier on compliance_snapshots(carrier_id, checked_at desc);
create index if not exists idx_interactions_load on interactions(load_id);

-- ===== updated_at trigger (loads is the only table with that column today) =====
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

drop trigger if exists loads_set_updated_at on loads;
create trigger loads_set_updated_at
  before update on loads
  for each row execute function set_updated_at();

-- ===== handle_new_user: auto-provision a profiles row on signup =====
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (new.id, 'sales_rep', new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Revoke public RPC exposure of the SECURITY DEFINER function -- closes the
-- exact finding the sibling ContractIQ project's Supabase advisor caught
revoke all on function handle_new_user() from anon, authenticated;

-- ===== Row Level Security =====
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

-- profiles: a user can read their own row, or any row if they're an admin;
-- a user can update only their own row
drop policy if exists "profiles_own_or_admin_select" on profiles;
create policy "profiles_own_or_admin_select" on profiles for select
  using (id = (select auth.uid()) or exists (
    select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin'
  ));

drop policy if exists "profiles_own_update" on profiles;
create policy "profiles_own_update" on profiles for update
  using (id = (select auth.uid()));

-- load_estimate_cache: shared reference cache -- any authenticated user can
-- read/write (it's not customer-scoped data, it's a shared lookup cache)
drop policy if exists "estimate_cache_read_all" on load_estimate_cache;
create policy "estimate_cache_read_all" on load_estimate_cache for select
  using ((select auth.uid()) is not null);

drop policy if exists "estimate_cache_write_all" on load_estimate_cache;
create policy "estimate_cache_write_all" on load_estimate_cache for insert
  with check ((select auth.uid()) is not null);

drop policy if exists "estimate_cache_update_all" on load_estimate_cache;
create policy "estimate_cache_update_all" on load_estimate_cache for update
  using ((select auth.uid()) is not null);

-- estimate_queries: own-rows only
drop policy if exists "estimate_queries_own" on estimate_queries;
create policy "estimate_queries_own" on estimate_queries for all
  using (user_id = (select auth.uid()));

-- loads/offers/bookings/exceptions: role-scoped (MVP -- all authenticated roles
-- relevant to ops can read; tighten to customer/assignment scoping once that
-- model exists, per engineering-doc.md's own Phase 2+ note)
drop policy if exists "loads_role_scoped" on loads;
create policy "loads_role_scoped" on loads for select
  using (exists (
    select 1 from profiles p where p.id = (select auth.uid())
    and p.role in ('admin', 'ops_manager', 'sales_rep', 'compliance')
  ));

drop policy if exists "offers_role_scoped" on offers;
create policy "offers_role_scoped" on offers for select
  using (exists (
    select 1 from profiles p where p.id = (select auth.uid())
    and p.role in ('admin', 'ops_manager', 'sales_rep', 'compliance')
  ));

drop policy if exists "bookings_role_scoped" on bookings;
create policy "bookings_role_scoped" on bookings for select
  using (exists (
    select 1 from profiles p where p.id = (select auth.uid())
    and p.role in ('admin', 'ops_manager', 'sales_rep')
  ));

drop policy if exists "exceptions_role_scoped" on exceptions;
create policy "exceptions_role_scoped" on exceptions for select
  using (exists (
    select 1 from profiles p where p.id = (select auth.uid())
    and p.role in ('admin', 'ops_manager', 'sales_rep', 'compliance')
  ));

-- audit_events: insert allowed for any authenticated caller (server-side writes
-- only in practice); select restricted to admin; no update/delete policy exists
-- at all -- append-only by omission, not just convention
drop policy if exists "audit_events_insert_only" on audit_events;
create policy "audit_events_insert_only" on audit_events for insert
  with check ((select auth.uid()) is not null);

drop policy if exists "audit_events_read_admin" on audit_events;
create policy "audit_events_read_admin" on audit_events for select
  using (exists (
    select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin'
  ));

-- control_actions: admin only, all operations
drop policy if exists "control_actions_admin_only" on control_actions;
create policy "control_actions_admin_only" on control_actions for all
  using (exists (
    select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin'
  ));

-- carriers/carrier_contacts/compliance_snapshots: readable by any authenticated role
drop policy if exists "carriers_read_all" on carriers;
create policy "carriers_read_all" on carriers for select
  using ((select auth.uid()) is not null);

drop policy if exists "carrier_contacts_read_all" on carrier_contacts;
create policy "carrier_contacts_read_all" on carrier_contacts for select
  using ((select auth.uid()) is not null);

drop policy if exists "compliance_snapshots_read_all" on compliance_snapshots;
create policy "compliance_snapshots_read_all" on compliance_snapshots for select
  using ((select auth.uid()) is not null);

-- customers/policies/interactions: admin + ops_manager
drop policy if exists "customers_admin_ops" on customers;
create policy "customers_admin_ops" on customers for select
  using (exists (
    select 1 from profiles p where p.id = (select auth.uid())
    and p.role in ('admin', 'ops_manager')
  ));

drop policy if exists "policies_admin_ops" on policies;
create policy "policies_admin_ops" on policies for select
  using (exists (
    select 1 from profiles p where p.id = (select auth.uid())
    and p.role in ('admin', 'ops_manager')
  ));

drop policy if exists "interactions_role_scoped" on interactions;
create policy "interactions_role_scoped" on interactions for select
  using (exists (
    select 1 from profiles p where p.id = (select auth.uid())
    and p.role in ('admin', 'ops_manager', 'sales_rep', 'compliance')
  ));
