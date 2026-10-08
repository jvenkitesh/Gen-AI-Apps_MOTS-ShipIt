-- MOTS ShipIt -- Transportation and Shipment domain: load transit and freight amount
-- One row per load-estimate enquiry: the ShipStation rate response plus the matching
-- routing guide entry. Keeps only the newest 200 rows (first in, first out).
-- ShipStation is used for estimates only (POST /v2/rates/estimate). ShipIt never purchases
-- labels or confirms a load to ShipStation; it reports the best choice back to the user.
-- Applied to Supabase as migration create_load_transit_freight_amount.

begin;

create table if not exists transportation_shipment.load_transit_freight_amount (
  id uuid primary key default gen_random_uuid(),

  -- The enquiry
  enquired_at timestamptz not null default now(),
  enquired_by uuid references auth.users (id) on delete set null,
  enquiry_text text not null,
  geography text not null default 'NA' references data_foundation.geographies (code),
  ship_to_zipcode text check (ship_to_zipcode ~ '^[0-9]{5}$'),
  ship_to_state_code text check (char_length(ship_to_state_code) = 2),
  package_weight_pounds numeric(10, 2) check (package_weight_pounds > 0),
  package_length_inches numeric(10, 2),
  package_width_inches numeric(10, 2),
  package_height_inches numeric(10, 2),

  -- Matching routing guide entry (copied at enquiry time, so later routing guide edits don't rewrite history)
  routing_guide_id uuid references transportation_shipment.routing_guide (id) on delete set null,
  routing_guide_origin_hub text,
  routing_guide_gateway_city text,
  routing_guide_carrier text,
  routing_guide_mode text,
  routing_guide_transport text,
  routing_guide_corridor text,
  routing_guide_distance_miles integer,
  routing_guide_transit_days integer,
  routing_guide_freight_cost_dollars numeric(10, 2),
  routing_guide_weight_break text,

  -- ShipStation response (POST /v2/rates/estimate)
  shipstation_status text not null check (shipstation_status in ('ok', 'unavailable', 'timeout', 'no_rates')),
  shipstation_rate_id text,
  shipstation_rate_type text,
  shipstation_carrier_id text,
  shipstation_carrier_code text,
  shipstation_carrier_friendly_name text,
  shipstation_service_code text,
  shipstation_service_type text,
  shipstation_package_type text,
  shipstation_zone integer,
  shipstation_currency text,
  shipstation_shipping_amount numeric(10, 2),
  shipstation_insurance_amount numeric(10, 2),
  shipstation_confirmation_amount numeric(10, 2),
  shipstation_other_amount numeric(10, 2),
  shipstation_total_amount numeric(10, 2) generated always as (
    coalesce(shipstation_shipping_amount, 0) + coalesce(shipstation_insurance_amount, 0)
    + coalesce(shipstation_confirmation_amount, 0) + coalesce(shipstation_other_amount, 0)
  ) stored,
  shipstation_delivery_days integer,
  shipstation_estimated_delivery_date timestamptz,
  shipstation_carrier_delivery_days text,
  shipstation_ship_date timestamptz,
  shipstation_guaranteed_service boolean,
  shipstation_negotiated_rate boolean,
  shipstation_trackable boolean,
  shipstation_validation_status text,
  shipstation_warning_messages jsonb not null default '[]',
  shipstation_error_messages jsonb not null default '[]',
  shipstation_all_rates jsonb not null default '[]'
);

comment on table transportation_shipment.load_transit_freight_amount is
  'One row per load-estimate enquiry: ShipStation rate response + matching routing guide entry. Capped at the newest 200 rows (FIFO).';
comment on column transportation_shipment.load_transit_freight_amount.shipstation_all_rates is
  'Every rate object ShipStation returned for this enquiry, unmodified. The shipstation_* columns hold the selected rate.';
comment on column transportation_shipment.load_transit_freight_amount.shipstation_total_amount is
  'Total of shipping + insurance + confirmation + other amounts. The selected rate is the one with the cheapest total.';

create index if not exists load_transit_freight_amount_enquired_at_idx
  on transportation_shipment.load_transit_freight_amount (enquired_at desc);
create index if not exists load_transit_freight_amount_ship_to_zipcode_idx
  on transportation_shipment.load_transit_freight_amount (ship_to_zipcode, enquired_at desc);

-- First in, first out: after each insert, keep only the newest 200 rows.
create or replace function transportation_shipment.keep_newest_200_load_transit_freight_amounts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from transportation_shipment.load_transit_freight_amount
  where id in (
    select id from transportation_shipment.load_transit_freight_amount
    order by enquired_at desc, id desc
    offset 200
  );
  return null;
end;
$$;

revoke execute on function transportation_shipment.keep_newest_200_load_transit_freight_amounts() from public, anon, authenticated;

drop trigger if exists keep_newest_200 on transportation_shipment.load_transit_freight_amount;
create trigger keep_newest_200
  after insert on transportation_shipment.load_transit_freight_amount
  for each statement
  execute function transportation_shipment.keep_newest_200_load_transit_freight_amounts();

alter table transportation_shipment.load_transit_freight_amount enable row level security;

drop policy if exists "Signed-in users can read load transit and freight amounts" on transportation_shipment.load_transit_freight_amount;
create policy "Signed-in users can read load transit and freight amounts"
  on transportation_shipment.load_transit_freight_amount
  for select to authenticated
  using (true);

grant select on transportation_shipment.load_transit_freight_amount to authenticated;
grant all on transportation_shipment.load_transit_freight_amount to service_role;

commit;
