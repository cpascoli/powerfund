-- A quarter reported in a different currency is a different observation.
--
-- `fundamentals_vintages` deduped on (instrument, period, source, knowable_at,
-- measures). Currency was not part of that, so when the ingest learned that TSMC
-- reports in TWD and SK hynix in KRW — figures previously stamped USD — the
-- corrected rows were skipped as unchanged and the wrong label survived. A
-- correction that the dedupe swallows is worse than no correction, because the
-- ingest reports success.
--
-- Currency joins both the skip predicate and the uniqueness constraint.

alter table public.fundamentals_vintages
  drop constraint fundamentals_vintages_observation_key;

alter table public.fundamentals_vintages
  add constraint fundamentals_vintages_observation_key unique nulls not distinct (
    instrument_id, period_end, source, knowable_at, currency,
    revenue, free_cash_flow, capex, net_debt, shares_diluted
  );

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
       and v.currency is not distinct from new.currency
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
