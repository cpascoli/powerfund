-- Power Fund Phase 1 system of record

create extension if not exists "pgcrypto";

create type public.asset_class as enum ('equity', 'etf', 'commodity_proxy', 'other');
create type public.instrument_status as enum ('watchlist', 'active', 'archived');
create type public.signal_status as enum ('new', 'reviewing', 'acted', 'dismissed');
create type public.signal_source as enum ('manual', 'scorer');
create type public.position_status as enum ('open', 'closed');
create type public.position_side as enum ('long', 'short');
create type public.decision_type as enum ('enter', 'add', 'reduce', 'exit', 'hold', 'watch');
create type public.document_type as enum (
  '10-k',
  '10-q',
  '8-k',
  'earnings',
  'transcript',
  'press',
  'other'
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.themes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  is_core boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.instruments (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  name text not null,
  asset_class public.asset_class not null default 'equity',
  exchange text,
  currency text not null default 'USD',
  status public.instrument_status not null default 'watchlist',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (symbol, exchange)
);

create trigger instruments_set_updated_at
before update on public.instruments
for each row execute function public.set_updated_at();

create table public.instrument_themes (
  instrument_id uuid not null references public.instruments (id) on delete cascade,
  theme_id uuid not null references public.themes (id) on delete cascade,
  is_primary boolean not null default true,
  primary key (instrument_id, theme_id)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid references public.instruments (id) on delete set null,
  source text not null,
  external_id text,
  doc_type public.document_type not null default 'other',
  title text not null,
  filed_at timestamptz,
  url text,
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index documents_instrument_id_idx on public.documents (instrument_id);
create index documents_filed_at_idx on public.documents (filed_at desc);

create table public.signals (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid references public.instruments (id) on delete set null,
  theme_id uuid references public.themes (id) on delete set null,
  source public.signal_source not null default 'manual',
  scorer_key text,
  title text not null,
  rationale text not null,
  confidence numeric(4, 3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  score numeric,
  status public.signal_status not null default 'new',
  payload jsonb not null default '{}'::jsonb,
  fired_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index signals_status_fired_at_idx on public.signals (status, fired_at desc);
create index signals_instrument_id_idx on public.signals (instrument_id);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references public.instruments (id) on delete restrict,
  status public.position_status not null default 'open',
  side public.position_side not null default 'long',
  quantity numeric not null check (quantity >= 0),
  avg_cost numeric not null check (avg_cost >= 0),
  opened_at timestamptz not null default timezone('utc', now()),
  closed_at timestamptz,
  thesis_summary text,
  invalidation text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger positions_set_updated_at
before update on public.positions
for each row execute function public.set_updated_at();

create index positions_status_idx on public.positions (status);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid references public.instruments (id) on delete set null,
  position_id uuid references public.positions (id) on delete set null,
  signal_id uuid references public.signals (id) on delete set null,
  decision_type public.decision_type not null,
  thesis text not null,
  catalysts text,
  risks text,
  invalidation text,
  sizing_rationale text,
  action_at timestamptz not null default timezone('utc', now()),
  outcome_notes text,
  outcome_grade text,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index decisions_action_at_idx on public.decisions (action_at desc);

create table public.portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  as_of timestamptz not null,
  nav numeric not null check (nav >= 0),
  cash numeric not null check (cash >= 0),
  notes text,
  exposures jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index portfolio_snapshots_as_of_idx on public.portfolio_snapshots (as_of desc);

-- RLS: single-operator authenticated access for Phase 1.
-- Tighten to ownership/org models when multi-user arrives.

alter table public.themes enable row level security;
alter table public.instruments enable row level security;
alter table public.instrument_themes enable row level security;
alter table public.documents enable row level security;
alter table public.signals enable row level security;
alter table public.positions enable row level security;
alter table public.decisions enable row level security;
alter table public.portfolio_snapshots enable row level security;

create policy "authenticated read themes"
  on public.themes for select to authenticated using (true);

create policy "authenticated write themes"
  on public.themes for all to authenticated
  using (true) with check (true);

create policy "authenticated read instruments"
  on public.instruments for select to authenticated using (true);

create policy "authenticated write instruments"
  on public.instruments for all to authenticated
  using (true) with check (true);

create policy "authenticated read instrument_themes"
  on public.instrument_themes for select to authenticated using (true);

create policy "authenticated write instrument_themes"
  on public.instrument_themes for all to authenticated
  using (true) with check (true);

create policy "authenticated read documents"
  on public.documents for select to authenticated using (true);

create policy "authenticated write documents"
  on public.documents for all to authenticated
  using (true) with check (true);

create policy "authenticated read signals"
  on public.signals for select to authenticated using (true);

create policy "authenticated write signals"
  on public.signals for all to authenticated
  using (true) with check (true);

create policy "authenticated read positions"
  on public.positions for select to authenticated using (true);

create policy "authenticated write positions"
  on public.positions for all to authenticated
  using (true) with check (true);

create policy "authenticated read decisions"
  on public.decisions for select to authenticated using (true);

create policy "authenticated write decisions"
  on public.decisions for all to authenticated
  using (true) with check (true);

create policy "authenticated read portfolio_snapshots"
  on public.portfolio_snapshots for select to authenticated using (true);

create policy "authenticated write portfolio_snapshots"
  on public.portfolio_snapshots for all to authenticated
  using (true) with check (true);

-- Table privileges for API roles (required in addition to RLS policies).
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;
grant select on all tables in schema public to anon;
grant usage, select, update on all sequences in schema public
  to authenticated, service_role;
