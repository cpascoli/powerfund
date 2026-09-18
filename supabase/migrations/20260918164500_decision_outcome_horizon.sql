-- The horizon a grade is about, recorded rather than inferred.
--
-- Clocked calibration grades a decision at 30, 90 and 180 days. The first
-- implementation carried no horizon column and derived which horizon an outcome
-- covered from when it was written: a grade recorded after a horizon's target
-- was taken to close it, so one grade at day 100 closed 30 and 90 together.
--
-- That is wrong in the way that matters most here. The point of grading on a
-- clock is to capture what a decision looked like at a predetermined horizon
-- *without* hindsight from what happened next. A CRDO thesis that looks wrong
-- and badly timed at 30 days and recovers by 100 has two different answers, and
-- a single day-100 row backfilled onto both horizons records the later one
-- twice. The same point-in-time discipline `fundamentals_vintages` enforces for
-- what we knew about a company applies to what we concluded about a decision.
--
-- Nor can one row carry two judgements: 30d "partly correct / timing poor" and
-- 90d "correct / timing mixed" are both grades we want, and they differ.
--
-- Nullable on purpose. A grade tied to a horizon is the clocked calibration this
-- column exists for, and the partial unique index gives it exactly one row per
-- horizon. A null means an off-clock observation -- a thesis invalidated at day
-- 12, a grade written when a position was exited -- which is worth keeping and
-- must not be mistaken for the 30-day grade. An off-clock row therefore leaves
-- the horizon still owed, which is correct: it has not been graded on the clock.

alter table public.decision_outcomes
  add column horizon_days smallint;

alter table public.decision_outcomes
  add constraint decision_outcomes_horizon_days_allowed
  check (horizon_days is null or horizon_days in (30, 90, 180));

-- One grade per decision per horizon. Partial, so any number of off-clock
-- observations remain possible.
create unique index decision_outcomes_decision_horizon_idx
  on public.decision_outcomes (decision_id, horizon_days)
  where horizon_days is not null;

comment on column public.decision_outcomes.horizon_days is
  'The 30/90/180-day horizon this grade is about, or null for an off-clock observation. Never inferred from recorded_at: the horizon is part of what the grade means.';
