-- Creating an Auth user was failing with "Database error creating new user".
-- The signup trigger reads and inserts public.app_users while GoTrue connects
-- as supabase_auth_admin. INSERT grants were not enough: the function also
-- SELECTs to decide viewer vs operator. Qualify "role" so auth.users.role
-- (the JWT role, e.g. 'authenticated') cannot be confused with app_role.

create or replace function public.register_app_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned public.app_role;
begin
  if exists (
    select 1
    from public.app_users as existing
    where existing."role" = 'operator'::public.app_role
  ) then
    assigned := 'viewer'::public.app_role;
  else
    assigned := 'operator'::public.app_role;
  end if;

  insert into public.app_users (user_id, "role")
  values (new.id, assigned)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

alter function public.register_app_user() owner to postgres;

grant execute on function public.register_app_user() to supabase_auth_admin;
grant select, insert on table public.app_users to supabase_auth_admin;
grant usage on type public.app_role to supabase_auth_admin;

drop policy if exists "auth admin insert app_users" on public.app_users;
create policy "auth admin insert app_users"
  on public.app_users
  for insert
  to supabase_auth_admin
  with check (true);

drop policy if exists "auth admin read app_users" on public.app_users;
create policy "auth admin read app_users"
  on public.app_users
  for select
  to supabase_auth_admin
  using (true);
