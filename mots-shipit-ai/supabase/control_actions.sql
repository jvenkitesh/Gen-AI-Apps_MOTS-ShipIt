-- MOTS ShipIt -- Feature 8: human control plane (C8)
-- Applied to Supabase as migration create_control_actions.
-- Every pause / resume / override / cancel is an append-only row. The latest pause/resume
-- for a scope decides whether that scope is paused; write paths check it before acting.

begin;

create table if not exists operational_excellence_governance.control_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users (id) on delete restrict,
  scope text not null check (scope in ('load', 'customer', 'lane', 'agent', 'channel', 'global')),
  scope_id text,
  action text not null check (action in ('pause', 'resume', 'override', 'cancel')),
  reason text not null check (char_length(reason) between 3 and 1000),
  created_at timestamptz not null default now(),
  check ((scope = 'global') = (scope_id is null))
);

create index if not exists control_actions_scope_idx
  on operational_excellence_governance.control_actions (scope, scope_id, created_at desc);

comment on table operational_excellence_governance.control_actions is
  'Append-only log of control-plane actions. scope_id: load id, customer id, lane "TN-GA", agent "outreach|negotiation|booking", channel "email|sms"; null for global.';

alter table operational_excellence_governance.control_actions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'operational_excellence_governance' and tablename = 'control_actions'
      and policyname = 'Signed-in users can read control actions'
  ) then
    create policy "Signed-in users can read control actions" on operational_excellence_governance.control_actions
      for select to authenticated using (true);
  end if;
end $$;

grant select on operational_excellence_governance.control_actions to authenticated;
grant all on operational_excellence_governance.control_actions to service_role;

commit;
