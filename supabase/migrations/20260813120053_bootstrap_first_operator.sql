-- Without this, a fresh database (`pnpm db:reset` then sign up) leaves the only
-- account as a viewer with no write access, because the operator bootstrap in
-- operator_role_and_lockdown can only promote accounts that already existed.
--
-- Rule: the first account on an empty database becomes the operator; every
-- account after that is a viewer. On the hosted project an operator already
-- exists, so this branch can never fire there.

create or replace function public.register_app_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_operator boolean;
begin
  select exists (
    select 1 from public.app_users where role = 'operator'
  ) into has_operator;

  insert into public.app_users (user_id, role)
  values (new.id, case when has_operator then 'viewer' else 'operator' end)
  on conflict (user_id) do nothing;

  return new;
end;
$$;
