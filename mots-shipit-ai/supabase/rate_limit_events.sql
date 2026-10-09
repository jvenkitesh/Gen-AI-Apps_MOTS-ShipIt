-- MOTS ShipIt -- Operational Excellence and Governance: rate limiting
-- Applied to Supabase as migration create_rate_limit_events.
--
-- Keyed by a generic identifier, NOT a user_id foreign key: "ip:<address>" before sign-in,
-- "user:<uuid>" after. A user_id-only design cannot limit the case that matters most --
-- brute-force logins against accounts that don't exist (lesson from the sibling ContractIQ build).
-- Only the server (service role) can call check_rate_limit; nobody can spoof another
-- caller's identifier to lock them out.

begin;

create schema if not exists operational_excellence_governance;

create table if not exists operational_excellence_governance.rate_limit_events (
  id bigint generated always as identity primary key,
  identifier text not null check (identifier ~ '^(ip|user):.+$'),
  -- carrier_reply added in Stage 7 (migration stage7_security_baseline, see rls-policies.sql).
  action text not null check (action in ('auth', 'estimate', 'booking', 'carrier_reply', 'webhook')),
  created_at timestamptz not null default now()
);

comment on table operational_excellence_governance.rate_limit_events is
  'One row per rate-limited request. identifier is ip:<address> (before sign-in) or user:<uuid> (after). Rows older than a day are pruned by check_rate_limit.';

create index if not exists rate_limit_events_lookup_idx
  on operational_excellence_governance.rate_limit_events (identifier, action, created_at desc);

alter table operational_excellence_governance.rate_limit_events enable row level security;

grant usage on schema operational_excellence_governance to service_role;
grant all on operational_excellence_governance.rate_limit_events to service_role;

-- Sliding window: counts this identifier's events for the action in the last window_seconds.
-- If under the limit, records the request and allows it; otherwise returns how long to wait.
create or replace function operational_excellence_governance.check_rate_limit(
  p_identifier text,
  p_action text,
  p_max_requests integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  recent_count integer;
  oldest_in_window timestamptz;
begin
  -- Serialize concurrent checks for the same identifier + action so bursts can't slip past the limit.
  perform pg_advisory_xact_lock(hashtext(p_identifier || '|' || p_action));

  select count(*), min(created_at)
    into recent_count, oldest_in_window
  from operational_excellence_governance.rate_limit_events
  where identifier = p_identifier
    and action = p_action
    and created_at > now() - make_interval(secs => p_window_seconds);

  if recent_count >= p_max_requests then
    return query select false,
      greatest(1, ceil(extract(epoch from (oldest_in_window + make_interval(secs => p_window_seconds) - now())))::integer);
    return;
  end if;

  insert into operational_excellence_governance.rate_limit_events (identifier, action)
  values (p_identifier, p_action);

  delete from operational_excellence_governance.rate_limit_events
  where created_at < now() - interval '1 day';

  return query select true, 0;
end;
$$;

revoke execute on function operational_excellence_governance.check_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function operational_excellence_governance.check_rate_limit(text, text, integer, integer) to service_role;

commit;
