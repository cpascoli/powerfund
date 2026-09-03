-- Behavioural tests for point-in-time fundamentals (DATA-1).
--
-- Run against a local database:
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/fundamentals_vintages.sql
--
-- Everything runs inside a transaction and rolls back. Any failed assertion
-- aborts with a non-zero exit code.
--
-- The property under test is the one whose absence made every scorer
-- look-ahead biased: asking for a quarter as of a past date must return what
-- was knowable then, not what we know now.

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_nvda uuid;
  v_filed date;
  v_rev numeric;
  v_basis text;
  v_count int;
  v_before int;
  v_raised boolean;
  v_vintage uuid;
begin
  select id into v_nvda from public.instruments where symbol = 'NVDA';
  if v_nvda is null then
    raise exception 'FAIL setup: NVDA not in the seeded universe';
  end if;

  delete from public.fundamentals_vintages where instrument_id = v_nvda;
  delete from public.fundamentals_quarterly where instrument_id = v_nvda;

  ---------------------------------------------------------------------------
  -- Filing date recovered from the stored vendor payloads
  ---------------------------------------------------------------------------
  -- Plain SEC shape.
  v_filed := public.fundamentals_filed_at(
    '{"revenue": {"filed": "2025-10-22"}, "ocf": {"filed": "2025-10-20"}}'::jsonb,
    date '2025-09-30'
  );
  if v_filed <> date '2025-10-22' then
    raise exception 'FAIL filed_at: expected the latest contributing fact, got %', v_filed;
  end if;

  -- SEC nested under a Yahoo hole-fill merge.
  v_filed := public.fundamentals_filed_at(
    '{"sec": {"revenue": {"filed": "2025-10-22"}}, "yahoo": {"date": "2025-09-30"}}'::jsonb,
    date '2025-09-30'
  );
  if v_filed <> date '2025-10-22' then
    raise exception 'FAIL filed_at: merged payload lost the SEC filing date, got %', v_filed;
  end if;

  -- Yahoo only: no filing date exists anywhere.
  v_filed := public.fundamentals_filed_at(
    '{"date": "2025-09-30T00:00:00.000Z", "totalRevenue": 123}'::jsonb,
    date '2025-09-30'
  );
  if v_filed is not null then
    raise exception 'FAIL filed_at: invented a filing date for a Yahoo row: %', v_filed;
  end if;

  -- A filing date before the period it reports is not believable.
  v_filed := public.fundamentals_filed_at(
    '{"revenue": {"filed": "2025-01-05"}}'::jsonb,
    date '2025-09-30'
  );
  if v_filed is not null then
    raise exception 'FAIL filed_at: accepted a filing date before the period end';
  end if;
  raise notice 'PASS filing dates recover from every stored payload shape';

  ---------------------------------------------------------------------------
  -- A vintage projects into fundamentals_quarterly with its provenance
  ---------------------------------------------------------------------------
  insert into public.fundamentals_vintages (
    instrument_id, period_end, filed_at, knowable_at, knowable_basis,
    observed_at, revenue, source
  ) values (
    v_nvda, date '2026-03-31', date '2026-05-01', date '2026-05-01', 'filing',
    timestamptz '2026-05-01 12:00Z', 100, 'sec'
  );

  select revenue, knowable_basis into v_rev, v_basis
    from public.fundamentals_quarterly
   where instrument_id = v_nvda and period_end = date '2026-03-31';
  if v_rev <> 100 or v_basis <> 'filing' then
    raise exception 'FAIL projection: expected 100/filing, got %/%', v_rev, v_basis;
  end if;
  raise notice 'PASS a vintage projects into the latest-known table';

  ---------------------------------------------------------------------------
  -- A restatement supersedes the original in the projection
  ---------------------------------------------------------------------------
  insert into public.fundamentals_vintages (
    instrument_id, period_end, filed_at, knowable_at, knowable_basis,
    observed_at, revenue, source
  ) values (
    v_nvda, date '2026-03-31', date '2026-08-14', date '2026-08-14', 'filing',
    timestamptz '2026-08-14 12:00Z', 92, 'sec'
  );

  select revenue into v_rev
    from public.fundamentals_quarterly
   where instrument_id = v_nvda and period_end = date '2026-03-31';
  if v_rev <> 92 then
    raise exception 'FAIL restatement: projection still shows %, expected 92', v_rev;
  end if;

  select count(*) into v_count
    from public.fundamentals_vintages
   where instrument_id = v_nvda and period_end = date '2026-03-31';
  if v_count <> 2 then
    raise exception 'FAIL restatement: original was destroyed, % vintages remain', v_count;
  end if;
  raise notice 'PASS a restatement supersedes without destroying the original';

  ---------------------------------------------------------------------------
  -- A late-arriving older observation must not downgrade the projection
  ---------------------------------------------------------------------------
  insert into public.fundamentals_vintages (
    instrument_id, period_end, filed_at, knowable_at, knowable_basis,
    observed_at, revenue, source
  ) values (
    v_nvda, date '2026-03-31', date '2026-06-10', date '2026-06-10', 'filing',
    timestamptz '2026-09-03 12:00Z', 95, 'sec'
  );

  select revenue into v_rev
    from public.fundamentals_quarterly
   where instrument_id = v_nvda and period_end = date '2026-03-31';
  if v_rev <> 92 then
    raise exception 'FAIL ordering: an older filing overwrote the newest, got %', v_rev;
  end if;
  raise notice 'PASS an older observation ingested late does not downgrade the projection';

  ---------------------------------------------------------------------------
  -- Point in time: what did we know then
  ---------------------------------------------------------------------------
  select revenue into v_rev
    from public.fundamentals_as_of(v_nvda, date '2026-05-15')
   where period_end = date '2026-03-31';
  if v_rev <> 100 then
    raise exception 'FAIL as_of: 15 May should still see 100, got %', v_rev;
  end if;

  select revenue into v_rev
    from public.fundamentals_as_of(v_nvda, date '2026-07-01')
   where period_end = date '2026-03-31';
  if v_rev <> 95 then
    raise exception 'FAIL as_of: 1 July should see the June restatement, got %', v_rev;
  end if;

  select revenue into v_rev
    from public.fundamentals_as_of(v_nvda, date '2026-09-01')
   where period_end = date '2026-03-31';
  if v_rev <> 92 then
    raise exception 'FAIL as_of: 1 Sep should see the August restatement, got %', v_rev;
  end if;

  select count(*) into v_count
    from public.fundamentals_as_of(v_nvda, date '2026-04-15');
  if v_count <> 0 then
    raise exception 'FAIL as_of: a quarter was visible before it was filed';
  end if;
  raise notice 'PASS as-of returns what was knowable, not what we know now';

  ---------------------------------------------------------------------------
  -- A strict run can refuse assumed filing dates
  ---------------------------------------------------------------------------
  insert into public.fundamentals_vintages (
    instrument_id, period_end, filed_at, knowable_at, knowable_basis,
    observed_at, revenue, source
  ) values (
    v_nvda, date '2026-06-30', null, date '2026-09-28', 'estimated',
    timestamptz '2026-09-28 12:00Z', 50, 'yahoo'
  );

  select count(*) into v_count
    from public.fundamentals_as_of(v_nvda, date '2026-10-01');
  if v_count <> 2 then
    raise exception 'FAIL as_of: expected both quarters, got %', v_count;
  end if;

  select count(*) into v_count
    from public.fundamentals_as_of(v_nvda, date '2026-10-01', false);
  if v_count <> 1 then
    raise exception 'FAIL as_of: estimated rows were not excluded, got %', v_count;
  end if;
  raise notice 'PASS a strict run can drop quarters whose filing date was assumed';

  ---------------------------------------------------------------------------
  -- Re-reading the same numbers is not a new vintage
  ---------------------------------------------------------------------------
  select count(*) into v_before
    from public.fundamentals_vintages where instrument_id = v_nvda;

  insert into public.fundamentals_vintages (
    instrument_id, period_end, filed_at, knowable_at, knowable_basis,
    observed_at, revenue, source
  ) values (
    v_nvda, date '2026-03-31', date '2026-08-14', date '2026-08-14', 'filing',
    timestamptz '2026-09-10 12:00Z', 92, 'sec'
  );

  select count(*) into v_count
    from public.fundamentals_vintages where instrument_id = v_nvda;
  if v_count <> v_before then
    raise exception
      'FAIL dedupe: an unchanged re-read added a vintage (% -> %)', v_before, v_count;
  end if;
  raise notice 'PASS an unchanged weekly re-read does not append a vintage';

  ---------------------------------------------------------------------------
  -- A quarter cannot become knowable before it ends
  ---------------------------------------------------------------------------
  v_raised := false;
  begin
    insert into public.fundamentals_vintages (
      instrument_id, period_end, knowable_at, knowable_basis, revenue, source
    ) values (
      v_nvda, date '2026-12-31', date '2026-11-01', 'filing', 1, 'sec'
    );
  exception when check_violation then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL guard: accepted a quarter knowable before it ended';
  end if;
  raise notice 'PASS a quarter cannot be knowable before it ends';

  ---------------------------------------------------------------------------
  -- Removing a vintage re-projects rather than stranding the projection
  ---------------------------------------------------------------------------
  -- Drop the newest observation of the March quarter; the projection must fall
  -- back to the previous one instead of keeping a value nothing supports.
  select id into v_vintage
    from public.fundamentals_vintages
   where instrument_id = v_nvda
     and period_end = date '2026-03-31'
   order by knowable_at desc
   limit 1;
  delete from public.fundamentals_vintages where id = v_vintage;

  select revenue, vintage_id into v_rev, v_vintage
    from public.fundamentals_quarterly
   where instrument_id = v_nvda and period_end = date '2026-03-31';
  if v_rev <> 95 then
    raise exception
      'FAIL reproject: after removing the newest vintage the projection shows %, expected 95', v_rev;
  end if;
  if v_vintage is null then
    raise exception 'FAIL reproject: projection lost its link to a live vintage';
  end if;

  -- Remove every observation of the quarter: the projection row must go too.
  delete from public.fundamentals_vintages
   where instrument_id = v_nvda and period_end = date '2026-03-31';
  select count(*) into v_count
    from public.fundamentals_quarterly
   where instrument_id = v_nvda and period_end = date '2026-03-31';
  if v_count <> 0 then
    raise exception 'FAIL reproject: projection kept a quarter with no observations';
  end if;
  raise notice 'PASS removing a vintage re-projects instead of stranding the row';

  ---------------------------------------------------------------------------
  -- reproject_fundamentals rebuilds the table from the vintages
  ---------------------------------------------------------------------------
  update public.fundamentals_quarterly
     set revenue = 1, knowable_at = date '2099-01-01', vintage_id = null
   where instrument_id = v_nvda and period_end = date '2026-06-30';
  perform public.reproject_fundamentals();
  select revenue, knowable_at into v_rev, v_filed
    from public.fundamentals_quarterly
   where instrument_id = v_nvda and period_end = date '2026-06-30';
  if v_rev <> 50 or v_filed <> date '2026-09-28' then
    raise exception
      'FAIL reproject: rebuild left revenue % knowable %, expected 50 / 2026-09-28',
      v_rev, v_filed;
  end if;
  raise notice 'PASS reproject_fundamentals rebuilds the projection from the vintages';

  ---------------------------------------------------------------------------
  -- The backfill left no quarter without provenance
  ---------------------------------------------------------------------------
  select count(*) into v_count
    from public.fundamentals_quarterly
   where knowable_at is null;
  if v_count > 0 then
    raise exception 'FAIL backfill: % projected quarters have no knowable_at', v_count;
  end if;
  raise notice 'PASS every projected quarter carries a knowable date';

  raise notice 'ALL FUNDAMENTALS VINTAGE TESTS PASSED';
end;
$$;

rollback;
