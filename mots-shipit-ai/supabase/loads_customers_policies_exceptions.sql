-- MOTS ShipIt -- Feature 3: load intake and policy engine (C1 + C2)
-- Applied to Supabase as migration create_loads_customers_policies_exceptions.
--   master_data_management.customers
--   operational_excellence_governance.sourcing_policies   (one active policy per customer)
--   transportation_shipment.loads                         (versioned per TMS external_id)
--   operational_excellence_governance.operational_exceptions
--   transportation_shipment.ingest_load(jsonb)            (atomic insert-or-new-version, service role only)
-- Signed-in users can read; only the server (service role) writes.

begin;

create schema if not exists master_data_management;
create schema if not exists operational_excellence_governance;
create schema if not exists transportation_shipment;

grant usage on schema master_data_management to authenticated, service_role;
grant usage on schema operational_excellence_governance to authenticated, service_role;

-- Customers (Master Data Management) -----------------------------------------------------
create table if not exists master_data_management.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  rate_authority jsonb not null default '{}',
  credit_terms text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table master_data_management.customers is
  'Golden record for each customer (shipper) whose loads ShipIt sources.';

-- Sourcing policies (Operational Excellence and Governance) -------------------------------
create table if not exists operational_excellence_governance.sourcing_policies (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references master_data_management.customers (id) on delete cascade,
  version integer not null default 1 check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  -- [{"origin_state":"TN","destination_state":"*"}]; "*" matches any state
  eligible_lanes jsonb not null default '[]',
  -- ["dry_van","reefer"]
  eligible_equipment jsonb not null default '[]',
  carrier_tiers jsonb not null default '[]',
  -- {"minimum_dollars": 500, "maximum_dollars": 5000}
  rate_bounds jsonb not null default '{}',
  concession_rules jsonb not null default '{}',
  approval_thresholds jsonb not null default '{}',
  effective_at timestamptz not null default now(),
  approved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (customer_id, version)
);
create unique index if not exists sourcing_policies_one_active_per_customer
  on operational_excellence_governance.sourcing_policies (customer_id) where status = 'active';
comment on table operational_excellence_governance.sourcing_policies is
  'Guardrails a load must meet before ShipIt sources carriers for it. Exactly one active policy per customer.';

-- Loads (Transportation and Shipment) ----------------------------------------------------
create table if not exists transportation_shipment.loads (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  version integer not null default 1 check (version > 0),
  geography text not null default 'NA' references data_foundation.geographies (code),
  customer_id uuid references master_data_management.customers (id) on delete restrict,
  origin_zipcode text not null check (origin_zipcode ~ '^[0-9]{5}$'),
  destination_zipcode text not null check (destination_zipcode ~ '^[0-9]{5}$'),
  origin_state_code text check (char_length(origin_state_code) = 2),
  destination_state_code text check (char_length(destination_state_code) = 2),
  equipment_type text not null check (equipment_type in ('dry_van', 'reefer')),
  scheduled_pickup_at timestamptz not null,
  scheduled_delivery_at timestamptz not null,
  commodity text not null,
  weight_pounds numeric(12, 2) not null check (weight_pounds > 0),
  target_rate_dollars numeric(12, 2) not null check (target_rate_dollars > 0),
  rate_ceiling_dollars numeric(12, 2) not null check (rate_ceiling_dollars > 0),
  status text not null default 'sourcing'
    check (status in ('sourcing', 'negotiating', 'booked', 'exception', 'cancelled')),
  evaluated_policy_id uuid references operational_excellence_governance.sourcing_policies (id) on delete set null,
  evaluated_policy_version integer,
  eligibility_reason_codes text[] not null default '{}',
  evaluated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_delivery_at >= scheduled_pickup_at),
  check (rate_ceiling_dollars >= target_rate_dollars)
);
create index if not exists loads_status_idx on transportation_shipment.loads (status, created_at desc);
create index if not exists loads_customer_idx on transportation_shipment.loads (customer_id);
comment on table transportation_shipment.loads is
  'Loads received from the TMS. A new webhook for the same external_id with changed terms creates a new version.';

-- Operational exceptions (Operational Excellence and Governance) -------------------------
create table if not exists operational_excellence_governance.operational_exceptions (
  id uuid primary key default gen_random_uuid(),
  load_id uuid references transportation_shipment.loads (id) on delete cascade,
  load_version integer,
  trigger_type text not null,
  details jsonb not null default '{}',
  recommended_action text,
  risk_level text not null default 'medium' check (risk_level in ('low', 'medium', 'high', 'critical')),
  sla_deadline timestamptz,
  status text not null default 'open' check (status in ('open', 'resolved', 'breached')),
  resolved_by uuid references auth.users (id) on delete set null,
  resolution text,
  created_at timestamptz not null default now()
);
create index if not exists operational_exceptions_open_idx
  on operational_excellence_governance.operational_exceptions (status, sla_deadline);
create index if not exists operational_exceptions_load_idx
  on operational_excellence_governance.operational_exceptions (load_id);
comment on table operational_excellence_governance.operational_exceptions is
  'Work that needs a person: loads the automation could not handle, with an SLA deadline.';

-- Row level security: signed-in users read, service role writes --------------------------
alter table master_data_management.customers enable row level security;
alter table operational_excellence_governance.sourcing_policies enable row level security;
alter table transportation_shipment.loads enable row level security;
alter table operational_excellence_governance.operational_exceptions enable row level security;

drop policy if exists "Signed-in users can read customers" on master_data_management.customers;
create policy "Signed-in users can read customers" on master_data_management.customers
  for select to authenticated using (true);
drop policy if exists "Signed-in users can read sourcing policies" on operational_excellence_governance.sourcing_policies;
create policy "Signed-in users can read sourcing policies" on operational_excellence_governance.sourcing_policies
  for select to authenticated using (true);
drop policy if exists "Signed-in users can read loads" on transportation_shipment.loads;
create policy "Signed-in users can read loads" on transportation_shipment.loads
  for select to authenticated using (true);
drop policy if exists "Signed-in users can read operational exceptions" on operational_excellence_governance.operational_exceptions;
create policy "Signed-in users can read operational exceptions" on operational_excellence_governance.operational_exceptions
  for select to authenticated using (true);

grant select on master_data_management.customers to authenticated;
grant select on operational_excellence_governance.sourcing_policies to authenticated;
grant select on transportation_shipment.loads to authenticated;
grant select on operational_excellence_governance.operational_exceptions to authenticated;
grant all on master_data_management.customers to service_role;
grant all on operational_excellence_governance.sourcing_policies to service_role;
grant all on transportation_shipment.loads to service_role;
grant all on operational_excellence_governance.operational_exceptions to service_role;

-- Atomic intake: insert a new load, or create a new version when the terms changed.
-- Returns outcome 'created' | 'new_version' | 'unchanged'. Concurrent webhooks for the
-- same external_id are serialized by the unique constraint + row lock.
create or replace function transportation_shipment.ingest_load(payload jsonb)
returns table (load_id uuid, load_version integer, outcome text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing transportation_shipment.loads%rowtype;
  new_row transportation_shipment.loads%rowtype;
begin
  insert into transportation_shipment.loads (
    external_id, customer_id, origin_zipcode, destination_zipcode, origin_state_code,
    destination_state_code, equipment_type, scheduled_pickup_at, scheduled_delivery_at,
    commodity, weight_pounds, target_rate_dollars, rate_ceiling_dollars
  ) values (
    payload ->> 'external_id', (payload ->> 'customer_id')::uuid, payload ->> 'origin_zipcode',
    payload ->> 'destination_zipcode', payload ->> 'origin_state_code', payload ->> 'destination_state_code',
    payload ->> 'equipment_type', (payload ->> 'scheduled_pickup_at')::timestamptz,
    (payload ->> 'scheduled_delivery_at')::timestamptz, payload ->> 'commodity',
    (payload ->> 'weight_pounds')::numeric, (payload ->> 'target_rate_dollars')::numeric,
    (payload ->> 'rate_ceiling_dollars')::numeric
  )
  on conflict (external_id) do nothing
  returning * into new_row;

  if new_row.id is not null then
    return query select new_row.id, new_row.version, 'created'::text;
    return;
  end if;

  select * into existing from transportation_shipment.loads
  where external_id = payload ->> 'external_id'
  for update;

  if (existing.customer_id, existing.origin_zipcode, existing.destination_zipcode, existing.equipment_type,
      existing.scheduled_pickup_at, existing.scheduled_delivery_at, existing.commodity, existing.weight_pounds,
      existing.target_rate_dollars, existing.rate_ceiling_dollars)
     is not distinct from
     ((payload ->> 'customer_id')::uuid, payload ->> 'origin_zipcode', payload ->> 'destination_zipcode',
      payload ->> 'equipment_type', (payload ->> 'scheduled_pickup_at')::timestamptz,
      (payload ->> 'scheduled_delivery_at')::timestamptz, payload ->> 'commodity',
      (payload ->> 'weight_pounds')::numeric, (payload ->> 'target_rate_dollars')::numeric,
      (payload ->> 'rate_ceiling_dollars')::numeric) then
    return query select existing.id, existing.version, 'unchanged'::text;
    return;
  end if;

  update transportation_shipment.loads set
    version = existing.version + 1,
    customer_id = (payload ->> 'customer_id')::uuid,
    origin_zipcode = payload ->> 'origin_zipcode',
    destination_zipcode = payload ->> 'destination_zipcode',
    origin_state_code = payload ->> 'origin_state_code',
    destination_state_code = payload ->> 'destination_state_code',
    equipment_type = payload ->> 'equipment_type',
    scheduled_pickup_at = (payload ->> 'scheduled_pickup_at')::timestamptz,
    scheduled_delivery_at = (payload ->> 'scheduled_delivery_at')::timestamptz,
    commodity = payload ->> 'commodity',
    weight_pounds = (payload ->> 'weight_pounds')::numeric,
    target_rate_dollars = (payload ->> 'target_rate_dollars')::numeric,
    rate_ceiling_dollars = (payload ->> 'rate_ceiling_dollars')::numeric,
    status = 'sourcing',
    eligibility_reason_codes = '{}',
    evaluated_policy_id = null,
    evaluated_policy_version = null,
    evaluated_at = null,
    updated_at = now()
  where id = existing.id
  returning * into new_row;

  return query select new_row.id, new_row.version, 'new_version'::text;
end;
$$;

revoke execute on function transportation_shipment.ingest_load(jsonb) from public, anon, authenticated;
grant execute on function transportation_shipment.ingest_load(jsonb) to service_role;

commit;
