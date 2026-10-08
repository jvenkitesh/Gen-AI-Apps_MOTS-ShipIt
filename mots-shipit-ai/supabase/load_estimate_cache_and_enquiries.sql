-- MOTS ShipIt -- Transportation and Shipment domain: load estimate cache and enquiry log
-- load_estimate_cache: latest answer per geography + zip or state + question type; valid for 24 hours.
-- load_estimate_enquiries: every question asked; keeps only the newest 200 rows (first in, first out).
-- Together with load_transit_freight_amount these are the three load-estimate tables.
-- Applied to Supabase as migration create_load_estimate_cache_and_enquiries.

begin;

create table if not exists transportation_shipment.load_estimate_cache (
  id uuid primary key default gen_random_uuid(),
  geography text not null default 'NA' references data_foundation.geographies (code),
  zip_or_state text not null check (zip_or_state ~ '^([0-9]{5}|[A-Z]{2})$'),
  query_type text not null check (query_type in ('transit_time', 'cost', 'both')),
  answer jsonb not null,
  sources jsonb not null default '[]',
  load_transit_freight_amount_id uuid
    references transportation_shipment.load_transit_freight_amount (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  constraint load_estimate_cache_entry_unique unique (geography, zip_or_state, query_type)
);

comment on table transportation_shipment.load_estimate_cache is
  'Latest load-estimate answer per geography + zip or state + question type. Serve from here only while expires_at is in the future; a newer answer replaces the row and resets expires_at to 24 hours.';
comment on column transportation_shipment.load_estimate_cache.answer is
  'Answer shown to the user: summary, transit_days, carrier, corridor, total_amount, currency.';

alter table transportation_shipment.load_estimate_cache enable row level security;

drop policy if exists "Signed-in users can read the load estimate cache" on transportation_shipment.load_estimate_cache;
create policy "Signed-in users can read the load estimate cache"
  on transportation_shipment.load_estimate_cache
  for select to authenticated
  using (true);

grant select on transportation_shipment.load_estimate_cache to authenticated;
grant all on transportation_shipment.load_estimate_cache to service_role;

create table if not exists transportation_shipment.load_estimate_enquiries (
  id uuid primary key default gen_random_uuid(),
  enquired_at timestamptz not null default now(),
  enquired_by uuid references auth.users (id) on delete set null,
  enquiry_text text not null,
  geography text not null default 'NA' references data_foundation.geographies (code),
  zip_or_state text check (zip_or_state ~ '^([0-9]{5}|[A-Z]{2})$'),
  query_type text check (query_type in ('transit_time', 'cost', 'both')),
  answered_from_cache boolean not null default false,
  load_estimate_cache_id uuid
    references transportation_shipment.load_estimate_cache (id) on delete set null,
  load_transit_freight_amount_id uuid
    references transportation_shipment.load_transit_freight_amount (id) on delete set null
);

comment on table transportation_shipment.load_estimate_enquiries is
  'Every load-estimate question asked, with whether it was answered from the cache. Capped at the newest 200 rows (FIFO).';

create index if not exists load_estimate_enquiries_enquired_at_idx
  on transportation_shipment.load_estimate_enquiries (enquired_at desc);
create index if not exists load_estimate_enquiries_enquired_by_idx
  on transportation_shipment.load_estimate_enquiries (enquired_by);

create or replace function transportation_shipment.keep_newest_200_load_estimate_enquiries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from transportation_shipment.load_estimate_enquiries
  where id in (
    select id from transportation_shipment.load_estimate_enquiries
    order by enquired_at desc, id desc
    offset 200
  );
  return null;
end;
$$;

revoke execute on function transportation_shipment.keep_newest_200_load_estimate_enquiries() from public, anon, authenticated;

drop trigger if exists keep_newest_200 on transportation_shipment.load_estimate_enquiries;
create trigger keep_newest_200
  after insert on transportation_shipment.load_estimate_enquiries
  for each statement
  execute function transportation_shipment.keep_newest_200_load_estimate_enquiries();

alter table transportation_shipment.load_estimate_enquiries enable row level security;

drop policy if exists "Signed-in users can read their own enquiries" on transportation_shipment.load_estimate_enquiries;
create policy "Signed-in users can read their own enquiries"
  on transportation_shipment.load_estimate_enquiries
  for select to authenticated
  using (enquired_by = (select auth.uid()));

grant select on transportation_shipment.load_estimate_enquiries to authenticated;
grant all on transportation_shipment.load_estimate_enquiries to service_role;

commit;
