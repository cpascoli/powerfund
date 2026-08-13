-- Behavioural tests for the transactions ledger.
--
-- Run against a local database:
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/ledger.sql
--
-- Everything runs inside a transaction and rolls back, so the local book is
-- left untouched. Any failed assertion aborts with a non-zero exit code.

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_nvda uuid;
  v_qty numeric;
  v_avg numeric;
  v_status text;
  v_closed timestamptz;
  v_cash numeric;
  v_cash_before numeric;
  v_realized numeric;
  v_basis numeric;
  v_failures int;
  v_raised boolean;
  v_planned uuid;
  v_other uuid;
begin
  select id into v_nvda from public.instruments where symbol = 'NVDA';
  if v_nvda is null then
    raise exception 'FAIL setup: NVDA not in the seeded universe';
  end if;

  select cash into v_cash_before from public.portfolio_state limit 1;

  ---------------------------------------------------------------------------
  -- A buy derives average cost from cash out, not from price x quantity.
  ---------------------------------------------------------------------------
  insert into public.transactions (occurred_at, kind, instrument_id, quantity, price, cash_delta)
  values ('2026-01-05 15:00:00+00', 'buy', v_nvda, 10, 100, -1000.00);

  select quantity, avg_cost into v_qty, v_avg
  from public.positions where instrument_id = v_nvda and status = 'open';

  if v_qty <> 10 or v_avg <> 100 then
    raise exception 'FAIL buy: expected 10 @ 100, got % @ %', v_qty, v_avg;
  end if;
  raise notice 'PASS buy opens a position at cash-derived average cost';

  ---------------------------------------------------------------------------
  -- Adding averages cost across both purchases.
  ---------------------------------------------------------------------------
  insert into public.transactions (occurred_at, kind, instrument_id, quantity, price, cash_delta)
  values ('2026-02-05 15:00:00+00', 'buy', v_nvda, 10, 120, -1200.00);

  select quantity, avg_cost into v_qty, v_avg
  from public.positions where instrument_id = v_nvda and status = 'open';

  if v_qty <> 20 or v_avg <> 110 then
    raise exception 'FAIL add: expected 20 @ 110, got % @ %', v_qty, v_avg;
  end if;
  raise notice 'PASS add averages cost across purchases';

  ---------------------------------------------------------------------------
  -- Partial sell: average cost unchanged (Section 104 pooling), realized P&L
  -- measured against it, cash credited.
  ---------------------------------------------------------------------------
  insert into public.transactions (occurred_at, kind, instrument_id, quantity, price, cash_delta)
  values ('2026-03-05 15:00:00+00', 'sell', v_nvda, 5, 130, 650.00);

  select quantity, avg_cost into v_qty, v_avg
  from public.positions where instrument_id = v_nvda and status = 'open';
  select realized_pnl into v_realized
  from public.transactions
  where instrument_id = v_nvda and kind = 'sell'
  order by occurred_at desc limit 1;

  if v_qty <> 15 or v_avg <> 110 then
    raise exception 'FAIL partial sell: expected 15 @ 110, got % @ %', v_qty, v_avg;
  end if;
  if v_realized <> 100 then
    raise exception 'FAIL partial sell: expected realized 100, got %', v_realized;
  end if;
  raise notice 'PASS partial sell keeps average cost and books realized P&L';

  ---------------------------------------------------------------------------
  -- Full exit closes the position and zeroes remaining basis exactly.
  ---------------------------------------------------------------------------
  insert into public.transactions (occurred_at, kind, instrument_id, quantity, price, cash_delta)
  values ('2026-04-06 15:00:00+00', 'sell', v_nvda, 15, 90, 1350.00);

  select status::text, closed_at, quantity into v_status, v_closed, v_qty
  from public.positions where instrument_id = v_nvda;

  if v_status <> 'closed' or v_closed is null or v_qty <> 0 then
    raise exception 'FAIL full exit: got status %, closed_at %, qty %',
      v_status, v_closed, v_qty;
  end if;

  select sum(basis_delta) into v_basis
  from public.transactions where instrument_id = v_nvda;
  if v_basis <> 0 then
    raise exception 'FAIL full exit: remaining basis should be 0, got %', v_basis;
  end if;

  select sum(realized_pnl) into v_realized
  from public.transactions where instrument_id = v_nvda and kind = 'sell';
  if v_realized <> -200 then
    raise exception 'FAIL full exit: expected total realized -200, got %', v_realized;
  end if;
  raise notice 'PASS full exit closes the position and zeroes basis to the cent';

  ---------------------------------------------------------------------------
  -- Cash tracks the ledger exactly.
  ---------------------------------------------------------------------------
  select cash into v_cash from public.portfolio_state limit 1;
  if v_cash <> v_cash_before - 1000 - 1200 + 650 + 1350 then
    raise exception 'FAIL cash: expected %, got %',
      v_cash_before - 1000 - 1200 + 650 + 1350, v_cash;
  end if;
  raise notice 'PASS cash reflects every ledger entry';

  ---------------------------------------------------------------------------
  -- Reconciliation reports no drift.
  ---------------------------------------------------------------------------
  select count(*) into v_failures
  from public.verify_book_against_ledger() where not ok;
  if v_failures > 0 then
    raise exception 'FAIL reconciliation: % checks disagree with the ledger', v_failures;
  end if;
  raise notice 'PASS projections reconcile against the ledger';

  ---------------------------------------------------------------------------
  -- Guard: cannot sell more than is held.
  ---------------------------------------------------------------------------
  insert into public.transactions (occurred_at, kind, instrument_id, quantity, price, cash_delta)
  values ('2026-05-06 15:00:00+00', 'buy', v_nvda, 1, 100, -100.00);

  v_raised := false;
  begin
    insert into public.transactions (occurred_at, kind, instrument_id, quantity, price, cash_delta)
    values ('2026-06-06 15:00:00+00', 'sell', v_nvda, 999, 100, 99900.00);
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL oversell guard: selling more than held was allowed';
  end if;
  raise notice 'PASS oversell is rejected';

  ---------------------------------------------------------------------------
  -- Guard: back-dating a trade would corrupt the running average, so refuse it.
  ---------------------------------------------------------------------------
  v_raised := false;
  begin
    insert into public.transactions (occurred_at, kind, instrument_id, quantity, price, cash_delta)
    values ('2020-01-01 15:00:00+00', 'buy', v_nvda, 1, 50, -50.00);
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL chronology guard: a back-dated trade was accepted';
  end if;
  raise notice 'PASS back-dated trades are rejected';

  ---------------------------------------------------------------------------
  -- Guard: history is append-only.
  ---------------------------------------------------------------------------
  v_raised := false;
  begin
    update public.transactions set cash_delta = -1 where kind = 'buy';
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL append-only: an update to history succeeded';
  end if;

  v_raised := false;
  begin
    delete from public.transactions where kind = 'buy';
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL append-only: a delete from history succeeded';
  end if;
  raise notice 'PASS ledger history cannot be edited or deleted';

  ---------------------------------------------------------------------------
  -- Guard: cash sign must match the kind of entry.
  ---------------------------------------------------------------------------
  v_raised := false;
  begin
    insert into public.transactions (occurred_at, kind, instrument_id, quantity, price, cash_delta)
    values ('2026-07-06 15:00:00+00', 'buy', v_nvda, 1, 100, 100.00);
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL cash sign: a buy that increased cash was accepted';
  end if;

  v_raised := false;
  begin
    insert into public.transactions (occurred_at, kind, instrument_id, cash_delta)
    values ('2026-07-06 15:00:00+00', 'deposit', v_nvda, 100.00);
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL entry shape: a deposit against an instrument was accepted';
  end if;
  raise notice 'PASS malformed entries are rejected by constraints';

  ---------------------------------------------------------------------------
  -- Guard: cash cannot go negative, so a withdrawal or buy beyond the balance
  -- is refused even if the application forgets to check.
  ---------------------------------------------------------------------------
  v_raised := false;
  begin
    insert into public.transactions (occurred_at, kind, cash_delta)
    values ('2026-08-06 15:00:00+00', 'withdrawal', -99999999.00);
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL cash floor: overdrawing the book was allowed';
  end if;
  raise notice 'PASS cash cannot be overdrawn';

  ---------------------------------------------------------------------------
  -- Guard: a planned action can only ever be booked once, so retrying a
  -- confirmation cannot double-book the same intent.
  ---------------------------------------------------------------------------
  insert into public.planned_actions (instrument_id, action_type, planned_usd, status)
  values (v_nvda, 'buy', 1000, 'pending')
  returning id into v_planned;

  insert into public.transactions (
    occurred_at, kind, instrument_id, quantity, price, cash_delta, planned_action_id
  )
  values ('2026-09-06 15:00:00+00', 'buy', v_nvda, 1, 100, -100.00, v_planned);

  v_raised := false;
  begin
    insert into public.transactions (
      occurred_at, kind, instrument_id, quantity, price, cash_delta, planned_action_id
    )
    values ('2026-09-06 15:00:00+00', 'buy', v_nvda, 1, 100, -100.00, v_planned);
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL idempotency: the same planned action was booked twice';
  end if;
  raise notice 'PASS a planned action cannot be booked twice';

  ---------------------------------------------------------------------------
  -- Fees are capitalised into cost basis, which is the UK CGT treatment.
  ---------------------------------------------------------------------------
  select id into v_other from public.instruments where symbol <> 'NVDA' limit 1;

  insert into public.transactions (
    occurred_at, kind, instrument_id, quantity, price, fees, cash_delta
  )
  values ('2026-10-06 15:00:00+00', 'buy', v_other, 10, 50, 7.00, -507.00);

  select avg_cost into v_avg
  from public.positions where instrument_id = v_other and status = 'open';
  if v_avg <> 50.7 then
    raise exception 'FAIL fees: expected average cost 50.7 including fees, got %', v_avg;
  end if;
  raise notice 'PASS fees are capitalised into cost basis';

  ---------------------------------------------------------------------------
  -- Regression: Supabase's `authenticator` role preloads `safeupdate`, which
  -- rejects any UPDATE without a WHERE clause. These tests connect as
  -- `postgres`, where it is not loaded, so a WHERE-less UPDATE inside a trigger
  -- passes here and then fails for every real request. Assert on the source
  -- instead, which does not depend on reproducing the library preload.
  ---------------------------------------------------------------------------
  select count(*) into v_failures
  from (
    select m[1] as stmt
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace,
      regexp_matches(p.prosrc, '(update\s+[a-z_."]+\s+set[^;]*;)', 'gi') as m
    where n.nspname = 'public'
  ) s
  where stmt !~* 'where';

  if v_failures > 0 then
    raise exception
      'FAIL safeupdate: % UPDATE statement(s) in public functions have no WHERE clause; they will fail for every API request',
      v_failures;
  end if;
  raise notice 'PASS no function relies on a WHERE-less UPDATE';

  raise notice 'ALL LEDGER TESTS PASSED';
end $$;

rollback;
