-- DATA-1: point-in-time fundamentals.
--
-- `fundamentals_quarterly` keyed a quarter on (instrument_id, period_end) and
-- upserted, so a restatement silently destroyed the original and there was no
-- way to reconstruct the information set available on a past date. Every scorer
-- built on it is look-ahead biased by construction and every backtest of one is
-- unfalsifiable — you cannot tell a real signal from a bug.
--
-- Same shape as the transactions ledger: `fundamentals_vintages` is the
-- append-only record of what we observed and when it became knowable;
-- `fundamentals_quarterly` stays as the latest-known projection, so no existing
-- read path changes.

create table public.fundamentals_vintages (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references public.instruments (id) on delete cascade,
  period_end date not null,
  fiscal_period text,

  -- Filing date as reported by the vendor. SEC companyfacts carries `filed` per
  -- fact; Yahoo publishes period ends only, so this is null for Yahoo-only rows.
  filed_at date,

  -- Earliest date this observation could have been known. Never null, so a
  -- point-in-time query is always `knowable_at <= D`. When there is no filing
  -- date this is period_end + 90 days: deliberately late, because assuming we
  -- learned something later than we did understates a strategy, while assuming
  -- earlier reintroduces the look-ahead this table exists to remove.
  knowable_at date not null,
  knowable_basis text not null
    check (knowable_basis in ('filing', 'estimated')),

  -- When the ingest saw it. Distinct from knowable_at, and the tie-break
  -- between two observations that became knowable the same day.
  observed_at timestamptz not null default timezone('utc', now()),

  revenue numeric,
  free_cash_flow numeric,
  capex numeric,
  net_debt numeric,
  shares_diluted numeric,
  currency text not null default 'USD',
  source text not null,
  raw jsonb not null default '{}'::jsonb,

  constraint fundamentals_vintages_knowable_after_period
    check (knowable_at >= period_end),

  -- One row per distinct observation. Re-reading the same numbers next week is
  -- not a new vintage; a restatement is. NULLS NOT DISTINCT so a quarter with
  -- missing measures cannot duplicate itself every run.
  constraint fundamentals_vintages_observation_key unique nulls not distinct (
    instrument_id, period_end, source, knowable_at,
    revenue, free_cash_flow, capex, net_debt, shares_diluted
  )
);

create index fundamentals_vintages_lookup_idx
  on public.fundamentals_vintages (instrument_id, period_end, knowable_at desc);

create index fundamentals_vintages_knowable_idx
  on public.fundamentals_vintages (knowable_at desc);

comment on table public.fundamentals_vintages is
  'Append-only observations of quarterly fundamentals. Query as of a date with fundamentals_as_of().';

alter table public.fundamentals_vintages enable row level security;

-- Written only by the ingest worker, which uses the service role and bypasses
-- RLS. No authenticated write policy, matching the other ingest tables.
create policy "authenticated read fundamentals_vintages"
  on public.fundamentals_vintages for select to authenticated using (true);

grant select on public.fundamentals_vintages to authenticated;
grant select, insert, update, delete on public.fundamentals_vintages to service_role;

-- Projection provenance. Consumers that only want current knowledge keep
-- reading fundamentals_quarterly and can now see how old that knowledge is.
alter table public.fundamentals_quarterly
  add column if not exists filed_at date,
  add column if not exists knowable_at date,
  add column if not exists knowable_basis text,
  add column if not exists vintage_id uuid
    references public.fundamentals_vintages (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Backfill: every existing row becomes its first vintage.
--
-- 1,235 `sec` rows carry the filing date at raw.{revenue,ocf,capex}.filed and
-- 139 `sec+yahoo` rows carry it at raw.sec.{...}.filed. The 117 Yahoo-only rows
-- have no filing date and are recorded as estimated.
--
-- This is a bootstrap, not history. `raw` kept only the *preferred* fact unit
-- per period, which is the most recently filed one — so an old quarter is dated
-- by the later filing that repeated it as a comparative, not by the filing that
-- first disclosed it. The first real ingest replaces these with one vintage per
-- filing straight from companyfacts; until then, treat pre-current quarters as
-- conservatively late rather than accurate.
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- Filing date recovered from a stored vendor payload.
--
-- SEC rows keep the contributing fact units at raw.{revenue,ocf,capex}; when a
-- Yahoo fill-in merged with them the SEC side moved under raw.sec. A quarter is
-- knowable once the *last* of its facts was filed, so take the greatest. A date
-- before the period it reports is not believable — return null so the caller
-- records the row as estimated rather than claiming foreknowledge. Mirrors
-- resolveKnowableAt in @powerfund/domain.
-- ---------------------------------------------------------------------------
create or replace function public.fundamentals_filed_at(
  p_raw jsonb,
  p_period_end date
)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when d is not null and d >= p_period_end then d
    else null
  end
  from (
    select greatest(
      nullif(coalesce(p_raw -> 'revenue' ->> 'filed', p_raw -> 'sec' -> 'revenue' ->> 'filed'), ''),
      nullif(coalesce(p_raw -> 'ocf'     ->> 'filed', p_raw -> 'sec' -> 'ocf'     ->> 'filed'), ''),
      nullif(coalesce(p_raw -> 'capex'   ->> 'filed', p_raw -> 'sec' -> 'capex'   ->> 'filed'), '')
    )::date as d
  ) parsed;
$$;

insert into public.fundamentals_vintages (
  instrument_id, period_end, fiscal_period, filed_at, knowable_at,
  knowable_basis, observed_at, revenue, free_cash_flow, capex, net_debt,
  shares_diluted, currency, source, raw
)
select
  f.instrument_id,
  f.period_end,
  f.fiscal_period,
  public.fundamentals_filed_at(f.raw, f.period_end),
  coalesce(public.fundamentals_filed_at(f.raw, f.period_end), f.period_end + 90),
  case
    when public.fundamentals_filed_at(f.raw, f.period_end) is not null
      then 'filing'
    else 'estimated'
  end,
  f.ingested_at,
  f.revenue,
  f.free_cash_flow,
  f.capex,
  f.net_debt,
  f.shares_diluted,
  f.currency,
  f.source,
  f.raw
from public.fundamentals_quarterly f;

-- ---------------------------------------------------------------------------
-- Projection: fundamentals_quarterly always holds the newest vintage.
-- ---------------------------------------------------------------------------
create or replace function public.project_fundamentals_vintage()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  best public.fundamentals_vintages%rowtype;
begin
  select v.* into best
    from public.fundamentals_vintages v
   where v.instrument_id = new.instrument_id
     and v.period_end = new.period_end
   order by v.knowable_at desc, v.observed_at desc, v.id desc
   limit 1;

  if best.id is null then
    return new;
  end if;

  insert into public.fundamentals_quarterly (
    instrument_id, period_end, fiscal_period, revenue, free_cash_flow, capex,
    net_debt, shares_diluted, currency, source, raw, ingested_at,
    filed_at, knowable_at, knowable_basis, vintage_id
  )
  values (
    best.instrument_id, best.period_end, best.fiscal_period, best.revenue,
    best.free_cash_flow, best.capex, best.net_debt, best.shares_diluted,
    best.currency, best.source, best.raw, best.observed_at,
    best.filed_at, best.knowable_at, best.knowable_basis, best.id
  )
  on conflict (instrument_id, period_end) do update set
    fiscal_period = excluded.fiscal_period,
    revenue = excluded.revenue,
    free_cash_flow = excluded.free_cash_flow,
    capex = excluded.capex,
    net_debt = excluded.net_debt,
    shares_diluted = excluded.shares_diluted,
    currency = excluded.currency,
    source = excluded.source,
    raw = excluded.raw,
    ingested_at = excluded.ingested_at,
    filed_at = excluded.filed_at,
    knowable_at = excluded.knowable_at,
    knowable_basis = excluded.knowable_basis,
    vintage_id = excluded.vintage_id;

  return new;
end;
$$;

create trigger fundamentals_vintages_project
  after insert on public.fundamentals_vintages
  for each row
  execute function public.project_fundamentals_vintage();

-- ---------------------------------------------------------------------------
-- Skip a re-read of numbers we already hold. The weekly job re-fetches ~20
-- quarters per name; without this every run would append a thousand identical
-- rows and "vintage" would stop meaning anything.
-- ---------------------------------------------------------------------------
create or replace function public.skip_unchanged_fundamentals_vintage()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1
      from public.fundamentals_vintages v
     where v.instrument_id = new.instrument_id
       and v.period_end = new.period_end
       and v.source = new.source
       and v.knowable_at = new.knowable_at
       and v.revenue is not distinct from new.revenue
       and v.free_cash_flow is not distinct from new.free_cash_flow
       and v.capex is not distinct from new.capex
       and v.net_debt is not distinct from new.net_debt
       and v.shares_diluted is not distinct from new.shares_diluted
  ) then
    return null;
  end if;
  return new;
end;
$$;

create trigger fundamentals_vintages_skip_unchanged
  before insert on public.fundamentals_vintages
  for each row
  execute function public.skip_unchanged_fundamentals_vintage();

-- ---------------------------------------------------------------------------
-- The information set as of a date: for each period, the newest observation
-- that was already knowable then. A restatement filed after `as_of` is
-- invisible, which is what makes a backtest falsifiable.
--
-- `include_estimated => false` drops quarters whose filing date had to be
-- guessed, for a strict run that will not tolerate an assumed date.
-- ---------------------------------------------------------------------------
create or replace function public.fundamentals_as_of(
  p_instrument_id uuid,
  p_as_of date,
  p_include_estimated boolean default true
)
returns setof public.fundamentals_vintages
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (v.period_end) v.*
    from public.fundamentals_vintages v
   where v.instrument_id = p_instrument_id
     and v.knowable_at <= p_as_of
     and (p_include_estimated or v.knowable_basis = 'filing')
   order by v.period_end, v.knowable_at desc, v.observed_at desc, v.id desc;
$$;

grant execute on function public.fundamentals_as_of(uuid, date, boolean)
  to authenticated, service_role;

-- Seed the projection columns from the vintages just written.
update public.fundamentals_quarterly f
   set filed_at = v.filed_at,
       knowable_at = v.knowable_at,
       knowable_basis = v.knowable_basis,
       vintage_id = v.id
  from public.fundamentals_vintages v
 where v.instrument_id = f.instrument_id
   and v.period_end = f.period_end;
