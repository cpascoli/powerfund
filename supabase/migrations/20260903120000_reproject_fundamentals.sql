-- Make the fundamentals projection survive a vintage being removed.
--
-- `fundamentals_quarterly` is a projection of `fundamentals_vintages`, but the
-- trigger only fired on insert. Pruning the bootstrap vintages therefore left
-- 1,026 projection rows still showing the pruned row's `knowable_at` and a
-- dangling `vintage_id` (nulled by the FK), and 76 of them showing values that
-- no longer matched any surviving observation. A projection that cannot be
-- rebuilt from its source is not a projection.
--
-- Two fixes: the trigger now handles deletes, and `reproject_fundamentals()`
-- rebuilds the whole table from the vintages so the invariant can be restored
-- at any time rather than only going forward.

create or replace function public.project_fundamentals_vintage()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_instrument uuid;
  v_period date;
  best public.fundamentals_vintages%rowtype;
begin
  if tg_op = 'DELETE' then
    v_instrument := old.instrument_id;
    v_period := old.period_end;
  else
    v_instrument := new.instrument_id;
    v_period := new.period_end;
  end if;

  select v.* into best
    from public.fundamentals_vintages v
   where v.instrument_id = v_instrument
     and v.period_end = v_period
   order by v.knowable_at desc, v.observed_at desc, v.id desc
   limit 1;

  -- The last observation of this quarter is gone, so the projection has nothing
  -- left to show. Keeping the row would assert knowledge nothing supports.
  if best.id is null then
    delete from public.fundamentals_quarterly f
     where f.instrument_id = v_instrument
       and f.period_end = v_period;
    return null;
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

  return null;
end;
$$;

drop trigger if exists fundamentals_vintages_project on public.fundamentals_vintages;

create trigger fundamentals_vintages_project
  after insert or delete on public.fundamentals_vintages
  for each row
  execute function public.project_fundamentals_vintage();

-- Rebuild the projection from the vintages. Idempotent, and the repair to run
-- after any bulk change to the vintage table.
create or replace function public.reproject_fundamentals()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rows integer;
begin
  delete from public.fundamentals_quarterly f
   where not exists (
     select 1
       from public.fundamentals_vintages v
      where v.instrument_id = f.instrument_id
        and v.period_end = f.period_end
   );

  insert into public.fundamentals_quarterly (
    instrument_id, period_end, fiscal_period, revenue, free_cash_flow, capex,
    net_debt, shares_diluted, currency, source, raw, ingested_at,
    filed_at, knowable_at, knowable_basis, vintage_id
  )
  select
    b.instrument_id, b.period_end, b.fiscal_period, b.revenue,
    b.free_cash_flow, b.capex, b.net_debt, b.shares_diluted, b.currency,
    b.source, b.raw, b.observed_at, b.filed_at, b.knowable_at,
    b.knowable_basis, b.id
  from (
    select distinct on (v.instrument_id, v.period_end) v.*
      from public.fundamentals_vintages v
     order by v.instrument_id, v.period_end, v.knowable_at desc,
              v.observed_at desc, v.id desc
  ) b
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

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

grant execute on function public.reproject_fundamentals() to service_role;

-- Heal the rows the bootstrap prune left behind.
select public.reproject_fundamentals();
