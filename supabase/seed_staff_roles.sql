-- Seed staff users and map auth users to platform roles.
-- Run this in Supabase SQL Editor after creating the auth users.

-- 1) Create organization if missing
insert into public.organizations (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Justra Demo Org')
on conflict (id) do update set name = excluded.name;

-- 2) Ensure role rows are present for each auth user email
with staff as (
  select id as user_id, email
  from auth.users
  where email in (
    'hr_admin@justra.demo',
    'compliance_officer@justra.demo',
    'platform_admin@justra.demo'
  )
),
mapped as (
  select
    user_id,
    case
      when email = 'hr_admin@justra.demo' then 'hr_admin'
      when email = 'compliance_officer@justra.demo' then 'compliance_officer'
      when email = 'platform_admin@justra.demo' then 'platform_admin'
    end as role
  from staff
)
insert into public.user_roles (id, user_id, org_id, role)
select coalesce(gen_random_uuid(), uuid_generate_v4()), user_id, '00000000-0000-0000-0000-000000000001', role
from mapped
where role is not null
on conflict do nothing;

-- 3) Verify final mapping
select u.email, r.role, r.org_id
from public.user_roles r
join auth.users u on u.id = r.user_id
order by u.email, r.role;
