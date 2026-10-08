-- MOTS ShipIt -- Data Foundation: carrier master (Feature 4, carrier ranking)
-- Applied to Supabase as migration create_carriers_seeded_from_routing_guide.
-- Carriers are seeded from the distinct carriers in transportation_shipment.routing_guide.
-- Seeded rows have no USDOT/MC numbers or equipment yet (the routing guide doesn't carry them):
-- tier defaults to 'approved' and equipment_types is empty, which ranking treats as
-- "equipment unverified" (lower score, not excluded). Replace with real carrier data before go-live.

begin;

create table if not exists data_foundation.carriers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  usdot_number text,
  mc_number text,
  tier text not null default 'approved' check (tier in ('preferred', 'approved', 'probationary', 'blocked')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  modes text[] not null default '{}',
  transport_types text[] not null default '{}',
  equipment_types text[] not null default '{}' check (equipment_types <@ array['dry_van', 'reefer']),
  -- {"last_successful_booking_at": "...", "successful_bookings": 0}
  service_history jsonb not null default '{}',
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table data_foundation.carriers is
  'Carrier master for transportation. USDOT and MC numbers are the US DOT and Motor Carrier authority identifiers.';

create table if not exists data_foundation.carrier_contacts (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid not null references data_foundation.carriers (id) on delete cascade,
  name text,
  phone text,
  email text,
  preferred_channel text check (preferred_channel in ('sms', 'email', 'voice')),
  authority_verified boolean not null default false,
  opt_out boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists carrier_contacts_carrier_idx on data_foundation.carrier_contacts (carrier_id);

alter table data_foundation.carriers enable row level security;
alter table data_foundation.carrier_contacts enable row level security;

drop policy if exists "Signed-in users can read carriers" on data_foundation.carriers;
create policy "Signed-in users can read carriers" on data_foundation.carriers
  for select to authenticated using (true);
drop policy if exists "Signed-in users can read carrier contacts" on data_foundation.carrier_contacts;
create policy "Signed-in users can read carrier contacts" on data_foundation.carrier_contacts
  for select to authenticated using (true);

grant select on data_foundation.carriers, data_foundation.carrier_contacts to authenticated;
grant all on data_foundation.carriers, data_foundation.carrier_contacts to service_role;

insert into data_foundation.carriers (name, modes, transport_types, source)
select carrier,
       array_agg(distinct mode order by mode),
       array_agg(distinct lower(transport) order by lower(transport)),
       'routing_guide_seed'
from transportation_shipment.routing_guide
group by carrier
on conflict (name) do update set
  modes = excluded.modes,
  transport_types = excluded.transport_types,
  updated_at = now();

commit;
