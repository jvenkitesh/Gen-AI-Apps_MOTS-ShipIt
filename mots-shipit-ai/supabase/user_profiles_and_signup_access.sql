-- MOTS ShipIt -- Data Foundation: user profiles and who may sign up
-- Applied to Supabase as migration create_user_profiles_and_signup_access.
--
-- Sign-up is limited to emails on allowed_signup_emails or whose domain is on
-- allowed_signup_domains, enforced by a trigger on auth.users so it cannot be bypassed.
-- Every new user gets a user_profiles row; the default role is supply_chain_operations_manager.

begin;

create schema if not exists data_foundation;

create table if not exists data_foundation.allowed_signup_domains (
  domain text primary key check (domain = lower(domain) and domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  created_at timestamptz not null default now()
);

create table if not exists data_foundation.allowed_signup_emails (
  email text primary key check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'),
  created_at timestamptz not null default now()
);

comment on table data_foundation.allowed_signup_domains is
  'Company email domains allowed to sign up (e.g. example.com). Managed with the service role only.';
comment on table data_foundation.allowed_signup_emails is
  'Individual email addresses allowed to sign up in addition to allowed_signup_domains. Managed with the service role only.';

alter table data_foundation.allowed_signup_domains enable row level security;
alter table data_foundation.allowed_signup_emails enable row level security;
grant all on data_foundation.allowed_signup_domains to service_role;
grant all on data_foundation.allowed_signup_emails to service_role;

insert into data_foundation.allowed_signup_emails (email) values ('jyotis.sqa@gmail.com')
on conflict (email) do nothing;

create table if not exists data_foundation.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'supply_chain_operations_manager' check (role in (
    'administrator',
    'supply_chain_operations_manager',
    'transportation_planner',
    'compliance_analyst',
    'viewer'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table data_foundation.user_profiles is
  'One profile per signed-up user. Role is changed only by the service role (administrators), never by the user.';

alter table data_foundation.user_profiles enable row level security;

drop policy if exists "Users can read their own profile" on data_foundation.user_profiles;
create policy "Users can read their own profile"
  on data_foundation.user_profiles
  for select to authenticated
  using (id = (select auth.uid()));

grant select on data_foundation.user_profiles to authenticated;
grant all on data_foundation.user_profiles to service_role;

create or replace function data_foundation.enforce_signup_allow_list()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  signup_email text := lower(coalesce(new.email, ''));
begin
  if exists (select 1 from data_foundation.allowed_signup_emails where email = signup_email)
     or exists (select 1 from data_foundation.allowed_signup_domains where domain = split_part(signup_email, '@', 2)) then
    return new;
  end if;
  raise exception 'SIGNUP_NOT_ALLOWED: sign-up is limited to approved company email addresses'
    using errcode = 'P0001';
end;
$$;

create or replace function data_foundation.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into data_foundation.user_profiles (id, email, full_name)
  values (new.id, lower(new.email), nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function data_foundation.enforce_signup_allow_list() from public, anon, authenticated;
revoke execute on function data_foundation.handle_new_user() from public, anon, authenticated;

drop trigger if exists enforce_signup_allow_list on auth.users;
create trigger enforce_signup_allow_list
  before insert on auth.users
  for each row execute function data_foundation.enforce_signup_allow_list();

drop trigger if exists create_user_profile on auth.users;
create trigger create_user_profile
  after insert on auth.users
  for each row execute function data_foundation.handle_new_user();

commit;
