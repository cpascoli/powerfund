-- Behavioural tests for the instrument status lifecycle.
--
-- Run against a local database:
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/instrument_status.sql
--
-- Driven through the real chain -- a transaction insert, apply_transaction
-- building the position, then the status sync -- rather than by setting status
-- directly, because the interaction between the two triggers is the thing worth
-- asserting and a direct UPDATE would skip exactly that.

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_i uuid;
  v_status public.instrument_status;
  v_events int;
  v_before int;
begin
  insert into public.instruments (symbol, name, status)
  values ('ZSTAT', 'Status Test Co', 'watchlist')
  returning id into v_i;

  -- Cash to spend, so apply_transaction's non-negative constraint is satisfied.
  insert into public.transactions (occurred_at, kind, cash_delta)
  values ('2026-01-02 15:00:00+00', 'deposit', 100000.00);

  select count(*) into v_before
  from public.watchlist_membership where instrument_id = v_i;

  ---------------------------------------------------------------------------
  -- Buying a name makes it active
  ---------------------------------------------------------------------------
  insert into public.transactions
    (occurred_at, kind, instrument_id, quantity, price, cash_delta)
  values ('2026-01-05 15:00:00+00', 'buy', v_i, 10, 100, -1000.00);

  select status into v_status from public.instruments where id = v_i;
  if v_status <> 'active' then
    raise exception 'FAIL: a held name reads %, not active', v_status;
  end if;
  raise notice 'PASS a fill moves the instrument to active';

  ---------------------------------------------------------------------------
  -- …and does not remove it from the watchlist
  ---------------------------------------------------------------------------
  -- The assertion the whole membership table depends on. Owning a name does not
  -- stop us having been watching it, and recording a removal here would erase
  -- precisely the names that worked from the record of what we were choosing
  -- from — survivorship bias with the sign reversed, indistinguishable from
  -- data. Until this migration nothing ever set 'active', so this guard had
  -- never actually been exercised by the path it guards.
  select count(*) into v_events
  from public.watchlist_membership where instrument_id = v_i;
  if v_events <> v_before then
    raise exception
      'FAIL: going active wrote % membership event(s); a held name has not left the watchlist',
      v_events - v_before;
  end if;
  raise notice 'PASS going active writes no membership event';

  ---------------------------------------------------------------------------
  -- A partial sell keeps it active
  ---------------------------------------------------------------------------
  insert into public.transactions
    (occurred_at, kind, instrument_id, quantity, price, cash_delta)
  values ('2026-02-05 15:00:00+00', 'sell', v_i, 4, 120, 480.00);

  select status into v_status from public.instruments where id = v_i;
  if v_status <> 'active' then
    raise exception 'FAIL: a partly reduced name reads %, not active', v_status;
  end if;
  raise notice 'PASS a partial sell leaves it active';

  ---------------------------------------------------------------------------
  -- A full exit returns it to the watchlist, still without a membership event
  ---------------------------------------------------------------------------
  insert into public.transactions
    (occurred_at, kind, instrument_id, quantity, price, cash_delta)
  values ('2026-03-05 15:00:00+00', 'sell', v_i, 6, 130, 780.00);

  select status into v_status from public.instruments where id = v_i;
  if v_status <> 'watchlist' then
    raise exception 'FAIL: an exited name reads %, not watchlist', v_status;
  end if;

  select count(*) into v_events
  from public.watchlist_membership where instrument_id = v_i;
  if v_events <> v_before then
    raise exception
      'FAIL: exiting wrote % membership event(s); it never left, so it cannot rejoin',
      v_events - v_before;
  end if;
  raise notice 'PASS a full exit returns it to watchlist and still writes nothing';

  ---------------------------------------------------------------------------
  -- Archived stays archived
  ---------------------------------------------------------------------------
  -- Archiving is a judgement about whether a name is worth watching at all.
  -- Owning it has no bearing on that, and a fill silently un-archiving a name
  -- would hide an operator decision behind a bookkeeping event.
  update public.instruments set status = 'archived' where id = v_i;
  insert into public.transactions
    (occurred_at, kind, instrument_id, quantity, price, cash_delta)
  values ('2026-04-06 15:00:00+00', 'buy', v_i, 1, 100, -100.00);

  select status into v_status from public.instruments where id = v_i;
  if v_status <> 'archived' then
    raise exception 'FAIL: a fill un-archived the instrument (now %)', v_status;
  end if;
  raise notice 'PASS a fill does not un-archive a name';

  raise notice 'ALL INSTRUMENT STATUS TESTS PASSED';
end $$;

rollback;
