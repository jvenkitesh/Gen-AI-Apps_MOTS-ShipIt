-- MOTS ShipIt -- Feature 6: negotiation (C5) and compliance (C6)
-- Applied to Supabase as migration create_carrier_offers_and_compliance_checks.
--   transportation_shipment.carrier_offers                       (negotiation ledger)
--   operational_excellence_governance.carrier_compliance_checks  (authority / insurance / safety / fraud)

begin;

-- Inbound carrier replies are logged with status 'received'.
alter table transportation_shipment.carrier_interactions drop constraint if exists carrier_interactions_status_check;
alter table transportation_shipment.carrier_interactions add constraint carrier_interactions_status_check
  check (status in ('simulated', 'sent', 'failed', 'skipped', 'received'));

create table if not exists transportation_shipment.carrier_offers (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references transportation_shipment.loads (id) on delete cascade,
  load_version integer not null,
  carrier_id uuid not null references data_foundation.carriers (id) on delete cascade,
  source_interaction_id uuid references transportation_shipment.carrier_interactions (id) on delete set null,
  rate_dollars numeric(12, 2) not null check (rate_dollars > 0),
  terms jsonb not null default '{}',
  confidence numeric(4, 3) check (confidence between 0 and 1),
  evidence text,
  status text not null default 'proposed'
    check (status in ('proposed', 'countered', 'accepted', 'rejected', 'expired', 'blocked')),
  counter_rate_dollars numeric(12, 2) check (counter_rate_dollars > 0),
  decision_note text,
  created_by uuid references auth.users (id) on delete set null,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists carrier_offers_load_idx on transportation_shipment.carrier_offers (load_id, load_version, created_at desc);
comment on table transportation_shipment.carrier_offers is
  'Negotiation ledger: one row per carrier offer for a load version. The rate ceiling is checked in server code, never by the model.';

create table if not exists operational_excellence_governance.carrier_compliance_checks (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid not null references data_foundation.carriers (id) on delete cascade,
  checked_at timestamptz not null default now(),
  source text not null check (source in ('fmcsa', 'manual')),
  result text not null check (result in ('pass', 'block')),
  authority_status text,
  insurance_status text,
  safety_rating text,
  out_of_service boolean,
  fraud_risk_score numeric(4, 3) check (fraud_risk_score between 0 and 1),
  reasons text[] not null default '{}',
  evidence jsonb not null default '{}',
  checked_by uuid references auth.users (id) on delete set null
);
create index if not exists carrier_compliance_checks_recent_idx
  on operational_excellence_governance.carrier_compliance_checks (carrier_id, checked_at desc);
comment on table operational_excellence_governance.carrier_compliance_checks is
  'Carrier authority, insurance, safety and fraud checks. A check older than the freshness window, or none at all, blocks any commitment (fail closed).';

alter table transportation_shipment.carrier_offers enable row level security;
alter table operational_excellence_governance.carrier_compliance_checks enable row level security;

drop policy if exists "Signed-in users can read carrier offers" on transportation_shipment.carrier_offers;
create policy "Signed-in users can read carrier offers" on transportation_shipment.carrier_offers
  for select to authenticated using (true);
drop policy if exists "Signed-in users can read compliance checks" on operational_excellence_governance.carrier_compliance_checks;
create policy "Signed-in users can read compliance checks" on operational_excellence_governance.carrier_compliance_checks
  for select to authenticated using (true);

grant select on transportation_shipment.carrier_offers to authenticated;
grant select on operational_excellence_governance.carrier_compliance_checks to authenticated;
grant all on transportation_shipment.carrier_offers to service_role;
grant all on operational_excellence_governance.carrier_compliance_checks to service_role;

commit;
