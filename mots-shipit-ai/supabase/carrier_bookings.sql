-- MOTS ShipIt -- Feature 7: atomic booking (C7) and TMS write-back
-- Applied to Supabase as migration create_carrier_bookings.
-- Double booking is prevented in the database, not in application code:
--   * idempotency_key UNIQUE   -> a retried request returns the same booking
--   * one active booking per load (partial unique index) -> a second, different booking fails
--   * commit_booking() runs every check and write in one transaction with the load row locked

begin;

create table if not exists transportation_shipment.carrier_bookings (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references transportation_shipment.loads (id) on delete restrict,
  load_version integer not null,
  carrier_id uuid not null references data_foundation.carriers (id) on delete restrict,
  offer_id uuid not null references transportation_shipment.carrier_offers (id) on delete restrict,
  rate_dollars numeric(12, 2) not null check (rate_dollars > 0),
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 100),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  tms_sync_status text not null default 'pending' check (tms_sync_status in ('pending', 'synced', 'failed')),
  tms_external_reference text,
  tms_sync_attempts integer not null default 0,
  tms_last_error text,
  tms_synced_at timestamptz,
  booked_by uuid references auth.users (id) on delete set null,
  booked_at timestamptz not null default now()
);

create unique index if not exists carrier_bookings_one_active_per_load
  on transportation_shipment.carrier_bookings (load_id) where status = 'active';

comment on table transportation_shipment.carrier_bookings is
  'Committed carrier bookings. The carrier commitment stands even if the TMS write-back fails; tms_sync_status tracks reconciliation.';

alter table transportation_shipment.carrier_bookings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'transportation_shipment' and tablename = 'carrier_bookings'
      and policyname = 'Signed-in users can read carrier bookings'
  ) then
    create policy "Signed-in users can read carrier bookings" on transportation_shipment.carrier_bookings
      for select to authenticated using (true);
  end if;
end $$;

grant select on transportation_shipment.carrier_bookings to authenticated;
grant all on transportation_shipment.carrier_bookings to service_role;

-- Returns (booking_id, outcome) where outcome is 'created' or 'existing'.
-- Raises BOOKING_* errors the API maps to clear messages.
create or replace function transportation_shipment.commit_booking(
  p_load_id uuid,
  p_offer_id uuid,
  p_idempotency_key text,
  p_booked_by uuid
)
returns table (booking_id uuid, outcome text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing transportation_shipment.carrier_bookings%rowtype;
  the_load transportation_shipment.loads%rowtype;
  the_offer transportation_shipment.carrier_offers%rowtype;
  new_id uuid;
begin
  select * into existing from transportation_shipment.carrier_bookings where idempotency_key = p_idempotency_key;
  if found then
    if existing.load_id <> p_load_id or existing.offer_id <> p_offer_id then
      raise exception 'BOOKING_KEY_REUSED: this idempotency key belongs to a different booking';
    end if;
    return query select existing.id, 'existing'::text;
    return;
  end if;

  select * into the_load from transportation_shipment.loads where id = p_load_id for update;
  if not found then
    raise exception 'BOOKING_LOAD_NOT_FOUND: load not found';
  end if;

  if exists (select 1 from transportation_shipment.carrier_bookings where load_id = p_load_id and status = 'active') then
    raise exception 'BOOKING_ALREADY_BOOKED: this load is already booked with a different offer';
  end if;

  select * into the_offer from transportation_shipment.carrier_offers where id = p_offer_id and load_id = p_load_id for update;
  if not found then
    raise exception 'BOOKING_OFFER_NOT_FOUND: offer not found for this load';
  end if;
  if the_offer.load_version <> the_load.version then
    raise exception 'BOOKING_LOAD_CHANGED: the load has changed since this offer; re-confirm the offer';
  end if;
  if the_load.status not in ('sourcing', 'negotiating') then
    raise exception 'BOOKING_LOAD_NOT_OPEN: the load is %', the_load.status;
  end if;
  if the_offer.status <> 'accepted' then
    raise exception 'BOOKING_OFFER_NOT_ACCEPTED: only an accepted offer can be booked';
  end if;
  if the_offer.rate_dollars > the_load.rate_ceiling_dollars then
    raise exception 'BOOKING_ABOVE_CEILING: the offer is above the load''s rate ceiling';
  end if;

  insert into transportation_shipment.carrier_bookings
    (load_id, load_version, carrier_id, offer_id, rate_dollars, idempotency_key, booked_by)
  values
    (p_load_id, the_load.version, the_offer.carrier_id, p_offer_id, the_offer.rate_dollars, p_idempotency_key, p_booked_by)
  returning id into new_id;

  update transportation_shipment.loads
    set status = 'booked', updated_at = now()
    where id = p_load_id;

  update transportation_shipment.carrier_offers
    set status = 'rejected', decision_note = 'Closed: the load was booked with another carrier.', updated_at = now()
    where load_id = p_load_id and id <> p_offer_id and status in ('proposed', 'countered', 'accepted');

  return query select new_id, 'created'::text;
end;
$$;

revoke execute on function transportation_shipment.commit_booking(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function transportation_shipment.commit_booking(uuid, uuid, text, uuid) to service_role;

commit;
