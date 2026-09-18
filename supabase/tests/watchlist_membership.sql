-- Behavioural tests for point-in-time watchlist membership.
--
-- Run against a local database:
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/watchlist_membership.sql
--
-- Everything runs inside a transaction and rolls back. Any failed assertion
-- aborts with a non-zero exit code.
--
-- These are invariant tests over stored data rather than unit tests over a
-- function, because the failure this table exists to prevent is not a wrong
-- number -- it is a record that looks complete and quietly is not.

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_theme uuid;
  v_id uuid;
  v_count int;
  v_event public.watchlist_event;
  v_raised boolean;
  t0 timestamptz := timestamptz '2026-01-05 12:00:00+00';
  t1 timestamptz := timestamptz '2026-03-10 12:00:00+00';
  t2 timestamptz := timestamptz '2026-06-15 12:00:00+00';
begin
  select id into v_theme from public.themes limit 1;

  insert into public.instruments (symbol, name, status)
  values ('ZTEST', 'Watchlist Test Co', 'watchlist')
  returning id into v_id;

  ---------------------------------------------------------------------------
  -- Creating an instrument records exactly one addition
  ---------------------------------------------------------------------------
  select count(*) into v_count
  from public.watchlist_membership where instrument_id = v_id;
  if v_count <> 1 then
    raise exception 'FAIL create: expected 1 event on insert, got %', v_count;
  end if;

  select event into v_event
  from public.watchlist_membership where instrument_id = v_id;
  if v_event <> 'added' then
    raise exception 'FAIL create: expected an addition, got %', v_event;
  end if;
  raise notice 'PASS a new instrument is recorded as watched';

  ---------------------------------------------------------------------------
  -- Buying a name is not leaving the opportunity set
  ---------------------------------------------------------------------------
  -- The assertion this table lives or dies by. When review item 8 makes
  -- bookFill move a held name to 'active', treating that as a removal would
  -- write an exit for every name we bought, erasing the winners from the record
  -- of what we were choosing from -- survivorship bias with the sign reversed,
  -- and indistinguishable from data.
  update public.instruments set status = 'active' where id = v_id;

  select count(*) into v_count
  from public.watchlist_membership where instrument_id = v_id;
  if v_count <> 1 then
    raise exception
      'FAIL active: watchlist -> active wrote % event(s); buying a name does not unwatch it',
      v_count - 1;
  end if;
  raise notice 'PASS moving a name to active records nothing';

  ---------------------------------------------------------------------------
  -- Archiving is a removal, un-archiving is an addition
  ---------------------------------------------------------------------------
  update public.instruments set status = 'archived' where id = v_id;

  select event into v_event
  from public.watchlist_membership
  where instrument_id = v_id
  order by occurred_at desc, created_at desc
  limit 1;
  if v_event <> 'removed' then
    raise exception 'FAIL archive: expected a removal, got %', v_event;
  end if;

  update public.instruments set status = 'watchlist' where id = v_id;

  select event into v_event
  from public.watchlist_membership
  where instrument_id = v_id
  order by occurred_at desc, created_at desc
  limit 1;
  if v_event <> 'added' then
    raise exception 'FAIL un-archive: expected an addition, got %', v_event;
  end if;

  -- Two events in one transaction share `occurred_at`, so the pair above is
  -- only readable in order because `created_at` uses clock_timestamp().
  select count(distinct created_at) into v_count
  from public.watchlist_membership where instrument_id = v_id;
  if v_count < 3 then
    raise exception
      'FAIL ordering: % distinct write stamps across 3 events; same-transaction events are indistinguishable',
      v_count;
  end if;
  raise notice 'PASS archive removes, un-archive re-adds, and the order survives';

  ---------------------------------------------------------------------------
  -- The log is append-only
  ---------------------------------------------------------------------------
  v_raised := false;
  begin
    update public.watchlist_membership set reason = 'rewritten'
    where instrument_id = v_id;
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL append-only: an event was editable';
  end if;

  v_raised := false;
  begin
    delete from public.watchlist_membership where instrument_id = v_id;
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL append-only: an event was deletable';
  end if;
  raise notice 'PASS events cannot be edited or deleted';

  ---------------------------------------------------------------------------
  -- Instrument history outlives an attempt to delete the instrument
  ---------------------------------------------------------------------------
  v_raised := false;
  begin
    delete from public.instruments where id = v_id;
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception
      'FAIL restrict: deleting an instrument silently discarded its membership history';
  end if;
  raise notice 'PASS membership history blocks an instrument delete';
end $$;

---------------------------------------------------------------------------
-- The projection answers "what were we watching on date D"
---------------------------------------------------------------------------
-- Written against explicit dates rather than trigger side effects, because the
-- question a replay asks is about a past date and the answer has to change as
-- that date moves. Asserting only the present would pass on a projection that
-- ignored `as_of` entirely.
do $$
declare
  v_id uuid;
  v_watched boolean;
  t0 timestamptz := timestamptz '2026-01-05 12:00:00+00';
  t1 timestamptz := timestamptz '2026-03-10 12:00:00+00';
  t2 timestamptz := timestamptz '2026-06-15 12:00:00+00';
begin
  insert into public.instruments (symbol, name, status)
  values ('ZPROJ', 'Projection Test Co', 'watchlist')
  returning id into v_id;

  -- The creation trigger has already written an 'added' event stamped now().
  -- It is left in place: every probe below is a date in the past, and an event
  -- that has not happened yet must not affect them. If `watchlist_as_of` ever
  -- stopped filtering on `occurred_at <= as_of`, this row is what would make
  -- the first assertion fail.
  insert into public.watchlist_membership (instrument_id, event, occurred_at, reason)
  values
    (v_id, 'added',   t0, 'entered the universe'),
    (v_id, 'removed', t1, 'thesis did not survive triage'),
    (v_id, 'added',   t2, 'reconsidered after the capex guide');

  select exists (
    select 1 from public.watchlist_as_of(t0 - interval '1 day')
    where instrument_id = v_id
  ) into v_watched;
  if v_watched then
    raise exception 'FAIL as_of: watched before it was ever added';
  end if;

  select exists (
    select 1 from public.watchlist_as_of(t0 + interval '1 day')
    where instrument_id = v_id
  ) into v_watched;
  if not v_watched then
    raise exception 'FAIL as_of: not watched the day after it was added';
  end if;

  select exists (
    select 1 from public.watchlist_as_of(t1 + interval '1 day')
    where instrument_id = v_id
  ) into v_watched;
  if v_watched then
    raise exception 'FAIL as_of: still watched after it was removed';
  end if;

  select exists (
    select 1 from public.watchlist_as_of(t2 + interval '1 day')
    where instrument_id = v_id
  ) into v_watched;
  if not v_watched then
    raise exception 'FAIL as_of: not watched after it was re-added';
  end if;
  raise notice 'PASS membership as of a past date follows the events, not the present';

  select exists (
    select 1 from public.watchlist_as_of(now()) where instrument_id = v_id
  ) into v_watched;
  if not v_watched then
    raise exception 'FAIL as_of: the present disagrees with the latest event';
  end if;
  raise notice 'PASS the present is just the newest point on the same timeline';
end $$;

---------------------------------------------------------------------------
-- Every instrument we hold is in the record
---------------------------------------------------------------------------
-- The seeded backfill is the only reason the eight live positions have any
-- membership history at all. If it missed them, the table would be useless for
-- exactly the names whose outcomes we know.
do $$
declare
  v_missing text;
begin
  select string_agg(i.symbol, ', ') into v_missing
  from public.instruments i
  where i.status <> 'archived'
    and not exists (
      select 1 from public.watchlist_membership m where m.instrument_id = i.id
    );

  if v_missing is not null then
    raise exception
      'FAIL coverage: % have no membership event, so no replay can know we watched them',
      v_missing;
  end if;
  raise notice 'PASS every live instrument has a membership record';

  raise notice 'ALL WATCHLIST MEMBERSHIP TESTS PASSED';
end $$;

rollback;
