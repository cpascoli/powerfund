-- Daily bars + quarterly fundamentals for free-tier ingest (Phase 1)

create table public.market_bars (
  instrument_id uuid not null references public.instruments (id) on delete cascade,
  bar_date date not null,
  open numeric,
  high numeric,
  low numeric,
  close numeric,
  adj_close numeric,
  volume numeric,
  source text not null,
  ingested_at timestamptz not null default timezone('utc', now()),
  primary key (instrument_id, bar_date)
);

create index market_bars_bar_date_idx on public.market_bars (bar_date desc);

create table public.market_caps (
  instrument_id uuid not null references public.instruments (id) on delete cascade,
  as_of_date date not null,
  market_cap numeric not null check (market_cap >= 0),
  source text not null,
  ingested_at timestamptz not null default timezone('utc', now()),
  primary key (instrument_id, as_of_date)
);

create table public.fundamentals_quarterly (
  instrument_id uuid not null references public.instruments (id) on delete cascade,
  period_end date not null,
  fiscal_period text,
  revenue numeric,
  free_cash_flow numeric,
  capex numeric,
  net_debt numeric,
  shares_diluted numeric,
  currency text not null default 'USD',
  source text not null,
  raw jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default timezone('utc', now()),
  primary key (instrument_id, period_end)
);

create index fundamentals_quarterly_period_end_idx
  on public.fundamentals_quarterly (period_end desc);

alter table public.market_bars enable row level security;
alter table public.market_caps enable row level security;
alter table public.fundamentals_quarterly enable row level security;

create policy "authenticated read market_bars"
  on public.market_bars for select to authenticated using (true);

create policy "authenticated write market_bars"
  on public.market_bars for all to authenticated
  using (true) with check (true);

create policy "authenticated read market_caps"
  on public.market_caps for select to authenticated using (true);

create policy "authenticated write market_caps"
  on public.market_caps for all to authenticated
  using (true) with check (true);

create policy "authenticated read fundamentals_quarterly"
  on public.fundamentals_quarterly for select to authenticated using (true);

create policy "authenticated write fundamentals_quarterly"
  on public.fundamentals_quarterly for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on public.market_bars
  to authenticated, service_role;
grant select on public.market_bars to anon;

grant select, insert, update, delete on public.market_caps
  to authenticated, service_role;
grant select on public.market_caps to anon;

grant select, insert, update, delete on public.fundamentals_quarterly
  to authenticated, service_role;
grant select on public.fundamentals_quarterly to anon;
