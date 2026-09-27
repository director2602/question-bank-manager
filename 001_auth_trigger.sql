-- ─────────────────────────────────────────────────────────────────────────
-- Run this once in the Supabase SQL Editor AFTER `npx prisma migrate deploy`
-- has created the `public.profiles` and `public.roles` tables.
--
-- It wires Supabase's built-in `auth.users` table to our `public.profiles`
-- table:
--   1. Adds a foreign key so profiles.id always maps to a real auth user
--      and is cleaned up automatically if the auth user is ever deleted.
--   2. Adds a trigger that inserts a `profiles` row whenever a new user
--      signs up.
--
-- Role model: this deployment uses a simple 1-Owner-plus-Users setup — one
-- account holds ADMIN ("Owner") rights, and every other account defaults to
-- EDITOR ("User", standard access: add questions, edit tags, generate/edit
-- papers). The stricter read-only VIEWER role still exists and can be
-- assigned later from the Users screen, but it is not the signup default.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Tie profiles.id to auth.users.id
alter table public.profiles
  add constraint profiles_id_fkey
  foreign key (id) references auth.users (id) on delete cascade;

-- 2. Auto-create a profile row for every new auth user.
--    Replace the emails below with your own bootstrap owner list (normally
--    just ONE email — the single Owner account), or leave empty and
--    promote the first Owner manually from the Users screen (see
--    README.md § First Owner Account).
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  default_role_id uuid;
  bootstrap_owners text[] := array['you@example.com']; -- ← update me (the ONE Owner account)
begin
  if new.email = any (bootstrap_owners) then
    select id into default_role_id from public.roles where code = 'ADMIN'; -- Owner
  else
    select id into default_role_id from public.roles where code = 'EDITOR'; -- standard User
  end if;

  insert into public.profiles (id, email, full_name, role_id, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    default_role_id,
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();
