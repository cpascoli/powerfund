-- A viewer may read the research, never the money.
--
-- Run against a local database:
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/viewer_read_surface.sql
--
-- The write side was gated on `is_operator()` in August; the read side was not,
-- and two viewer accounts spent three weeks able to read the cash balance, every
-- fill, and the buys that had not happened yet. This asserts the boundary from
-- the outside — as the `authenticated` role with a viewer's JWT — rather than
-- trusting the policy text, because a policy that exists and a policy that
-- denies are different claims.

\set ON_ERROR_STOP on

begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, created_at, updated_at
)
values
  ('11111111-1111-1111-1111-111111111111',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'operator@test', 'x', now(), now()),
  ('22222222-2222-2222-2222-222222222222',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'viewer@test', 'x', now(), now())
on conflict (id) do nothing;

insert into public.app_users (user_id, role)
values
  ('11111111-1111-1111-1111-111111111111', 'operator'),
  ('22222222-2222-2222-2222-222222222222', 'viewer')
on conflict (user_id) do update set role = excluded.role;

-- Something to see, so "viewer sees nothing" is a refusal and not an empty table.
insert into public.portfolio_state (cash, notes)
values (225499.97, 'read-surface test')
on conflict do nothing;

do $$
declare
  tbl text;
  operator_rows int;
  viewer_rows int;
  total_visible int := 0;
  book_tables text[] := array[
    'positions', 'portfolio_state', 'portfolio_snapshots',
    'transactions', 'planned_actions'
  ];
  research_tables text[] := array[
    'instruments', 'themes', 'dossiers', 'decisions', 'review_tasks',
    'market_bars', 'signals'
  ];
begin
  foreach tbl in array book_tables loop
    set local role authenticated;
    perform set_config(
      'request.jwt.claims',
      '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
      true
    );
    execute format('select count(*) from public.%I', tbl) into operator_rows;

    perform set_config(
      'request.jwt.claims',
      '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
      true
    );
    execute format('select count(*) from public.%I', tbl) into viewer_rows;
    reset role;

    total_visible := total_visible + operator_rows;
    if viewer_rows > 0 then
      raise exception
        'FAIL read surface: a viewer can read % (% rows)', tbl, viewer_rows;
    end if;
  end loop;

  -- Guard the guard: if the operator saw nothing either, the loop above proved
  -- only that the tables were empty.
  if total_visible = 0 then
    raise exception
      'FAIL read surface: the operator saw no rows, so the test proved nothing';
  end if;
  raise notice 'PASS a viewer cannot read positions, cash, snapshots, the ledger or the queue';

  -- The point is a boundary, not a lockout: research stays shared.
  foreach tbl in array research_tables loop
    set local role authenticated;
    perform set_config(
      'request.jwt.claims',
      '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
      true
    );
    execute format('select count(*) from public.%I', tbl) into operator_rows;

    perform set_config(
      'request.jwt.claims',
      '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
      true
    );
    execute format('select count(*) from public.%I', tbl) into viewer_rows;
    reset role;

    if operator_rows <> viewer_rows then
      raise exception
        'FAIL read surface: research table % is not shared (operator %, viewer %)',
        tbl, operator_rows, viewer_rows;
    end if;
  end loop;
  raise notice 'PASS research tables stay readable by both roles';

  -- Writing was already gated; assert it stayed that way.
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
    true
  );
  begin
    insert into public.planned_actions (instrument_id, action_type, planned_usd)
    values (
      (select id from public.instruments limit 1), 'buy', 1000
    );
    reset role;
    raise exception 'FAIL read surface: a viewer queued a trade';
  exception
    when insufficient_privilege or check_violation then
      reset role;
      raise notice 'PASS a viewer still cannot write';
  end;

  raise notice 'ALL VIEWER READ SURFACE TESTS PASSED';
end;
$$;

rollback;
