-- Current setup snapshot for the shadow fundamental-inflection scorer.
-- Written only by the ingest worker (service role). Authenticated clients read.

create table public.instrument_setups (
  instrument_id uuid not null references public.instruments (id) on delete cascade,
  scorer_key text not null,
  scorer_version integer not null,
  setup text not null,
  fundamental_state text not null,
  completeness text not null,
  stale boolean not null default false,
  period_end date,
  as_of date not null,
  calculated_at timestamptz not null,
  ingested_at timestamptz,
  days_since_period_end integer,
  last_close numeric,
  closes_count integer not null default 0,
  rationale text not null,
  snapshot jsonb not null,
  hysteresis jsonb not null,
  primary key (instrument_id, scorer_key)
);

create index instrument_setups_setup_idx
  on public.instrument_setups (setup, as_of desc);

alter table public.instrument_setups enable row level security;

create policy "authenticated read instrument_setups"
  on public.instrument_setups for select to authenticated using (true);

grant select on public.instrument_setups to authenticated, service_role;
grant insert, update, delete on public.instrument_setups to service_role;

revoke all privileges on public.instrument_setups from anon;
