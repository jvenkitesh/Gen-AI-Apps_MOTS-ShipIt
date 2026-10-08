-- MOTS ShipIt -- Feature 9: audit log (C9)
-- Applied to Supabase as migration create_audit_events.
-- Every state change on loads, offers, compliance checks, bookings, exceptions and control
-- actions writes one audit row from a trigger, so it commits in the SAME transaction as the
-- change. audit_events is append-only: a guard trigger rejects every update and delete,
-- for every role, and no role is granted update/delete.

begin;

create table if not exists operational_excellence_governance.audit_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  entity_type text not null,
  entity_id uuid not null,
  load_id uuid,
  event_type text not null,
  actor_id uuid,
  payload jsonb not null default '{}',
  model_version text,
  policy_version integer
);
create index if not exists audit_events_entity_idx on operational_excellence_governance.audit_events (entity_type, entity_id, occurred_at desc);
create index if not exists audit_events_load_idx on operational_excellence_governance.audit_events (load_id, occurred_at desc);
create index if not exists audit_events_recent_idx on operational_excellence_governance.audit_events (occurred_at desc);
comment on table operational_excellence_governance.audit_events is
  'Immutable audit trail. Written only by triggers (and recordEvent for events with no row change). Never updated or deleted.';

alter table operational_excellence_governance.audit_events enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'operational_excellence_governance'
      and tablename = 'audit_events' and policyname = 'Signed-in users can read the audit trail'
  ) then
    create policy "Signed-in users can read the audit trail" on operational_excellence_governance.audit_events
      for select to authenticated using (true);
  end if;
end $$;
revoke all on operational_excellence_governance.audit_events from public, anon, authenticated, service_role;
grant select on operational_excellence_governance.audit_events to authenticated;
grant select, insert on operational_excellence_governance.audit_events to service_role;

create or replace function operational_excellence_governance.reject_audit_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'AUDIT_IMMUTABLE: audit events can never be changed or removed';
end;
$$;

create or replace trigger audit_events_immutable
  before update or delete on operational_excellence_governance.audit_events
  for each row execute function operational_excellence_governance.reject_audit_change();

create or replace trigger audit_events_no_truncate
  before truncate on operational_excellence_governance.audit_events
  for each statement execute function operational_excellence_governance.reject_audit_change();

-- One generic trigger function for every audited table.
create or replace function operational_excellence_governance.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n jsonb := to_jsonb(new);
  o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  entity text;
  the_load uuid;
  actor uuid;
  events text[] := '{}';
  ev text;
begin
  actor := coalesce(
    (n ->> 'actor_id')::uuid, (n ->> 'decided_by')::uuid, (n ->> 'booked_by')::uuid,
    (n ->> 'resolved_by')::uuid, (n ->> 'checked_by')::uuid, (n ->> 'created_by')::uuid,
    auth.uid()
  );

  if tg_table_name = 'loads' then
    entity := 'load'; the_load := (n ->> 'id')::uuid;
    if tg_op = 'INSERT' then events := array['created'];
    else
      if (n ->> 'version') is distinct from (o ->> 'version') then events := events || 'version_incremented'; end if;
      if (n ->> 'status') is distinct from (o ->> 'status') then events := events || 'status_changed'; end if;
    end if;
  elsif tg_table_name = 'carrier_offers' then
    entity := 'offer'; the_load := (n ->> 'load_id')::uuid;
    if tg_op = 'INSERT' or (n ->> 'status') is distinct from (o ->> 'status') then events := array[n ->> 'status']; end if;
  elsif tg_table_name = 'carrier_compliance_checks' then
    entity := 'compliance_check'; events := array['checked'];
  elsif tg_table_name = 'carrier_bookings' then
    entity := 'booking'; the_load := (n ->> 'load_id')::uuid;
    if tg_op = 'INSERT' then events := array['committed'];
    elsif (n ->> 'tms_sync_status') is distinct from (o ->> 'tms_sync_status') then
      events := array[case when n ->> 'tms_sync_status' = 'synced' then 'tms_sync_succeeded' else 'tms_sync_failed' end];
    elsif (n ->> 'status') is distinct from (o ->> 'status') then events := array['status_changed'];
    end if;
  elsif tg_table_name = 'operational_exceptions' then
    entity := 'exception'; the_load := (n ->> 'load_id')::uuid;
    if tg_op = 'INSERT' then events := array['raised'];
    else
      if (n ->> 'status') is distinct from (o ->> 'status') then events := events || (n ->> 'status'); end if;
      if (n ->> 'risk_level') is distinct from (o ->> 'risk_level') and n ->> 'risk_level' = 'critical' then events := events || 'escalated'; end if;
    end if;
  elsif tg_table_name = 'control_actions' then
    entity := 'control_action';
    if n ->> 'scope' = 'load' then the_load := (n ->> 'scope_id')::uuid; end if;
    events := array[n ->> 'action'];
  else
    return new;
  end if;

  foreach ev in array events loop
    insert into operational_excellence_governance.audit_events
      (entity_type, entity_id, load_id, event_type, actor_id, payload, policy_version)
    values (
      entity, (n ->> 'id')::uuid, the_load, ev, actor,
      jsonb_build_object('operation', lower(tg_op), 'new', n, 'old', nullif(o, '{}'::jsonb)),
      nullif(n ->> 'evaluated_policy_version', '')::integer
    );
  end loop;
  return new;
end;
$$;

revoke execute on function operational_excellence_governance.audit_row_change() from public, anon, authenticated;
revoke execute on function operational_excellence_governance.reject_audit_change() from public, anon, authenticated;

create or replace trigger audit_loads after insert or update on transportation_shipment.loads
  for each row execute function operational_excellence_governance.audit_row_change();
create or replace trigger audit_carrier_offers after insert or update on transportation_shipment.carrier_offers
  for each row execute function operational_excellence_governance.audit_row_change();
create or replace trigger audit_carrier_compliance_checks after insert on operational_excellence_governance.carrier_compliance_checks
  for each row execute function operational_excellence_governance.audit_row_change();
create or replace trigger audit_carrier_bookings after insert or update on transportation_shipment.carrier_bookings
  for each row execute function operational_excellence_governance.audit_row_change();
create or replace trigger audit_operational_exceptions after insert or update on operational_excellence_governance.operational_exceptions
  for each row execute function operational_excellence_governance.audit_row_change();
create or replace trigger audit_control_actions after insert on operational_excellence_governance.control_actions
  for each row execute function operational_excellence_governance.audit_row_change();

commit;
