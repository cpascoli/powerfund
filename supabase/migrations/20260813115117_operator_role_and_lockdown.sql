-- P0 access hardening — findings SEC-2, SEC-3, SEC-5, SEC-7 in
-- docs/reviews/2026-08-13-full-review.md
--
-- Before this migration every authenticated account could read and write the
-- entire book (`using (true) with check (true)`), and `anon` held table-level
-- SELECT on everything, leaving RLS as the only barrier.
--
-- After it:
--   * writing anything requires an explicit `operator` role,
--   * new accounts default to `viewer` (read-only) — this is the foundation for
--     sharing the book with friends, see review §8,
--   * ingested market data is writable only by the service role,
--   * `anon` holds no table privileges.

create type public.app_role as enum ('operator', 'viewer');

create table public.app_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'viewer',
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.app_users enable row level security;

-- A user may read their own role. There is deliberately no write policy:
-- roles are assigned out of band (service role or SQL) so that a user can
-- never escalate themselves to operator.
create policy "read own app_user"
  on public.app_users for select to authenticated
  using (user_id = auth.uid());

grant select on public.app_users to authenticated;
grant select, insert, update, delete on public.app_users to service_role;

-- Existing accounts keep full access; everything created from now on is a viewer.
insert into public.app_users (user_id, role)
select id, 'operator' from auth.users
on conflict (user_id) do nothing;

create or replace function public.register_app_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.app_users (user_id, role)
  values (new.id, 'viewer')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger app_users_register_on_signup
after insert on auth.users
for each row execute function public.register_app_user();

-- Wrapped as `(select public.is_operator())` at every call site so the planner
-- evaluates it once per statement instead of once per row.
create or replace function public.is_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_users
    where user_id = auth.uid()
      and role = 'operator'
  );
$$;

-- Replace the blanket `authenticated write <table>` policies. Read policies are
-- left untouched: the viewer read surface is a product decision (review §8).
do $$
declare
  tbl text;
  operator_tables text[] := array[
    'themes', 'instruments', 'instrument_themes', 'documents', 'signals',
    'positions', 'decisions', 'portfolio_snapshots', 'dossiers',
    'portfolio_state', 'planned_actions'
  ];
  -- Written only by the ingest worker, which uses the service role and so
  -- bypasses RLS entirely. No authenticated write policy is recreated.
  ingest_tables text[] := array[
    'market_bars', 'market_caps', 'fundamentals_quarterly'
  ];
begin
  foreach tbl in array operator_tables || ingest_tables loop
    execute format(
      'drop policy if exists %I on public.%I',
      'authenticated write ' || tbl, tbl
    );
  end loop;

  foreach tbl in array operator_tables loop
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check ((select public.is_operator()))',
      'operator insert ' || tbl, tbl
    );
    execute format(
      'create policy %I on public.%I for update to authenticated
         using ((select public.is_operator()))
         with check ((select public.is_operator()))',
      'operator update ' || tbl, tbl
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using ((select public.is_operator()))',
      'operator delete ' || tbl, tbl
    );
  end loop;
end $$;

-- SEC-3: strip anon table privileges, including the default-privilege rule that
-- was silently granting SELECT on every future table.
revoke select on all tables in schema public from anon;
alter default privileges in schema public revoke select on tables from anon;

-- SEC-7: pin the search_path on the existing trigger function.
alter function public.set_updated_at() set search_path = '';
