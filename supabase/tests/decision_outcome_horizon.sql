-- Behavioural tests for clocked calibration grades.
--
-- Run against a local database:
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/decision_outcome_horizon.sql
--
-- The property under test: a grade says which horizon it is about, and the
-- horizon cannot be graded twice. Inferring the horizon from recorded_at let one
-- grade written at day 100 stand for the 30- and 90-day judgements as well,
-- which writes hindsight into the record built to exclude it.

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_instrument uuid;
  v_decision uuid;
  v_raised boolean;
  v_count int;
begin
  select id into v_instrument from public.instruments limit 1;

  insert into public.decisions (instrument_id, decision_type, thesis, action_at)
  values (v_instrument, 'enter', 'Test thesis', now())
  returning id into v_decision;

  ---------------------------------------------------------------------------
  -- A horizon can be graded once
  ---------------------------------------------------------------------------
  insert into public.decision_outcomes
    (decision_id, thesis_grade, horizon_days, lessons)
  values (v_decision, 'partly_correct', 30, 'Early, not wrong.');

  v_raised := false;
  begin
    insert into public.decision_outcomes
      (decision_id, thesis_grade, horizon_days, lessons)
    values (v_decision, 'correct', 30, 'Rewriting the 30-day view.');
  exception when unique_violation then
    v_raised := true;
  end;
  if not v_raised then
    raise exception
      'FAIL uniqueness: a second 30-day grade was accepted, so an earlier judgement can be revised with hindsight';
  end if;
  raise notice 'PASS one grade per decision per horizon';

  ---------------------------------------------------------------------------
  -- The later horizons are still open
  ---------------------------------------------------------------------------
  -- The failure the horizon column exists to prevent: a 30-day grade must not
  -- stand in for 90 or 180, and grading 180 must not close the two before it.
  insert into public.decision_outcomes
    (decision_id, thesis_grade, horizon_days, lessons)
  values
    (v_decision, 'correct', 90, 'Business evidence arrived.'),
    (v_decision, 'correct', 180, 'Thesis played out.');

  select count(*) into v_count
  from public.decision_outcomes where decision_id = v_decision;
  if v_count <> 3 then
    raise exception 'FAIL horizons: expected 3 distinct grades, got %', v_count;
  end if;

  select count(*) into v_count
  from public.decision_outcomes
  where decision_id = v_decision and horizon_days = 30
    and thesis_grade = 'partly_correct';
  if v_count <> 1 then
    raise exception
      'FAIL point-in-time: the 30-day grade no longer reads partly_correct';
  end if;
  raise notice 'PASS each horizon keeps its own judgement';

  ---------------------------------------------------------------------------
  -- Off-clock observations stay possible, and unlimited
  ---------------------------------------------------------------------------
  -- A thesis invalidated at day 12 is worth recording and is not the 30-day
  -- grade. The unique index is partial so these never collide.
  insert into public.decision_outcomes
    (decision_id, thesis_grade, horizon_days, lessons)
  values
    (v_decision, 'wrong', null, 'Invalidation hit early.'),
    (v_decision, 'wrong', null, 'Second off-clock note.');
  raise notice 'PASS off-clock observations are unconstrained';

  ---------------------------------------------------------------------------
  -- Only the three horizons exist
  ---------------------------------------------------------------------------
  v_raised := false;
  begin
    insert into public.decision_outcomes
      (decision_id, thesis_grade, horizon_days, lessons)
    values (v_decision, 'correct', 45, 'A horizon nobody agreed to.');
  exception when check_violation then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL check: horizon_days accepted a value outside 30/90/180';
  end if;
  raise notice 'PASS horizon_days is limited to 30, 90 and 180';

  ---------------------------------------------------------------------------
  -- Grades remain append-only
  ---------------------------------------------------------------------------
  v_raised := false;
  begin
    update public.decision_outcomes set horizon_days = 90
    where decision_id = v_decision and horizon_days = 30;
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL append-only: a recorded grade was re-pointed at another horizon';
  end if;
  raise notice 'PASS a grade cannot be moved to another horizon';

  raise notice 'ALL DECISION OUTCOME HORIZON TESTS PASSED';
end $$;

rollback;
