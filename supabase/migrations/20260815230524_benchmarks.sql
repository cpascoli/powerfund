-- Index proxies for mandate benchmarks. SPY adj_close is the investable
-- S&P 500 total-return proxy (success); QQQ adj_close is the Nasdaq-100
-- total-return proxy (style). They live on `instruments` so the existing
-- bars ingest writes them, and `is_benchmark` keeps them off the research
-- universe. No blended policy portfolio.

alter table public.instruments
  add column is_benchmark boolean not null default false;

create index instruments_research_idx
  on public.instruments (symbol)
  where not is_benchmark;

create type public.benchmark_role as enum ('success', 'style');

create table public.benchmarks (
  role public.benchmark_role primary key,
  instrument_id uuid not null unique references public.instruments (id)
    on delete restrict,
  label text not null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.benchmarks enable row level security;

create policy "authenticated read benchmarks"
  on public.benchmarks for select to authenticated using (true);

create policy "operator insert benchmarks"
  on public.benchmarks for insert to authenticated
  with check ((select public.is_operator()));

create policy "operator update benchmarks"
  on public.benchmarks for update to authenticated
  using ((select public.is_operator()))
  with check ((select public.is_operator()));

create policy "operator delete benchmarks"
  on public.benchmarks for delete to authenticated
  using ((select public.is_operator()));

grant select, insert, update, delete on public.benchmarks
  to authenticated, service_role;
revoke all privileges on public.benchmarks from anon;

insert into public.instruments (
  symbol, name, asset_class, exchange, status, is_benchmark, notes
)
values
  (
    'SPY',
    'SPDR S&P 500 ETF Trust',
    'etf',
    'US',
    'watchlist',
    true,
    'Success benchmark: investable S&P 500 total-return proxy. Not a research name.'
  ),
  (
    'QQQ',
    'Invesco QQQ Trust',
    'etf',
    'US',
    'watchlist',
    true,
    'Style benchmark: investable Nasdaq-100 total-return proxy. Not a research name.'
  )
on conflict (symbol, exchange) do update
  set
    name = excluded.name,
    asset_class = excluded.asset_class,
    is_benchmark = true,
    notes = excluded.notes,
    updated_at = timezone('utc', now());

insert into public.benchmarks (role, instrument_id, label)
select
  v.role::public.benchmark_role,
  i.id,
  v.label
from (
  values
    ('success', 'SPY', 'S&P 500 total return (SPY)'),
    ('style', 'QQQ', 'Nasdaq-100 total return (QQQ)')
) as v(role, symbol, label)
join public.instruments i
  on i.symbol = v.symbol
 and i.exchange = 'US'
on conflict (role) do update
  set
    instrument_id = excluded.instrument_id,
    label = excluded.label;
