-- MOTS ShipIt -- Stage 7 security baseline (paste-and-run in the Supabase SQL Editor).
-- Idempotent: safe to run again at any time. It re-asserts the security settings every
-- other migration already applied, so a new environment (or a drifted one) ends up the same.
-- The only new change in Stage 7 is the rate-limit action list (carrier_reply). Applied to
-- project gunsbekosmitvudjpmgg as migration stage7_security_baseline, 2026-10-08.
--
-- Model: one organization. Every signed-in user may READ the operational data (RLS policies
-- "using (true)" per table, created by each feature's migration); ALL writes go through the
-- server with the service role, after role checks in requireAuth(). Anonymous users get nothing.

begin;

-- 1. Row level security on every table in the six domain schemas.
do $$
declare t record;
begin
  for t in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r'
      and n.nspname in ('data_foundation', 'master_data_management', 'order_management',
                        'warehouse_management', 'transportation_shipment', 'operational_excellence_governance')
  loop
    execute format('alter table %I.%I enable row level security', t.schema_name, t.table_name);
    -- Anonymous visitors never read or write any table directly.
    execute format('revoke all on %I.%I from anon', t.schema_name, t.table_name);
  end loop;
end $$;

-- 2. Tables only the server may touch: RLS on, no policies, no grants to signed-in users.
revoke all on data_foundation.allowed_signup_emails from anon, authenticated;
revoke all on data_foundation.allowed_signup_domains from anon, authenticated;
revoke all on operational_excellence_governance.rate_limit_events from anon, authenticated;

-- 3. Rate limiting (sliding window, keyed ip:<address> before sign-in, user:<uuid> after).
--    Stage 7 adds carrier_reply: each pasted carrier reply is an OpenAI call.
create table if not exists operational_excellence_governance.rate_limit_events (
  id bigint generated always as identity primary key,
  identifier text not null check (identifier ~ '^(ip|user):.+$'),
  action text not null,
  created_at timestamptz not null default now()
);
alter table operational_excellence_governance.rate_limit_events
  drop constraint if exists rate_limit_events_action_check;
alter table operational_excellence_governance.rate_limit_events
  add constraint rate_limit_events_action_check
  check (action in ('auth', 'estimate', 'booking', 'carrier_reply', 'webhook'));
create index if not exists rate_limit_events_lookup_idx
  on operational_excellence_governance.rate_limit_events (identifier, action, created_at desc);

-- 4. The audit log can be read, never changed: no update/delete grant for anyone
--    (guard triggers in audit_events.sql raise AUDIT_IMMUTABLE as a second layer).
revoke update, delete, truncate on operational_excellence_governance.audit_events from public, anon, authenticated, service_role;

-- 5. Database functions are server-only: nobody can call them through the public API.
revoke execute on function data_foundation.handle_new_user() from public, anon, authenticated;
revoke execute on function data_foundation.enforce_signup_allow_list() from public, anon, authenticated;
revoke execute on function operational_excellence_governance.check_rate_limit(text, text, integer, integer) from public, anon, authenticated;
revoke execute on function operational_excellence_governance.audit_row_change() from public, anon, authenticated;
revoke execute on function operational_excellence_governance.reject_audit_change() from public, anon, authenticated;
revoke execute on function transportation_shipment.ingest_load(jsonb) from public, anon, authenticated;
revoke execute on function transportation_shipment.commit_booking(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function transportation_shipment.keep_newest_200_load_estimate_enquiries() from public, anon, authenticated;
revoke execute on function transportation_shipment.keep_newest_200_load_transit_freight_amounts() from public, anon, authenticated;

commit;

-- Check (read-only): every table should show rls = true and no anon grants.
-- select n.nspname, c.relname, c.relrowsecurity as rls,
--        has_table_privilege('anon', c.oid, 'select') as anon_can_read
-- from pg_class c join pg_namespace n on n.oid = c.relnamespace
-- where c.relkind = 'r' and n.nspname in ('data_foundation', 'master_data_management', 'order_management',
--   'warehouse_management', 'transportation_shipment', 'operational_excellence_governance')
-- order by 1, 2;
