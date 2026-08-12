-- Live cash balance for Power Fund. NAV = cash + mark-to-market of open positions.

create table public.portfolio_state (
  id uuid primary key default gen_random_uuid(),
  cash numeric not null check (cash >= 0),
  notes text,
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger portfolio_state_set_updated_at
before update on public.portfolio_state
for each row execute function public.set_updated_at();

alter table public.portfolio_state enable row level security;

create policy "authenticated read portfolio_state"
  on public.portfolio_state for select to authenticated using (true);

create policy "authenticated write portfolio_state"
  on public.portfolio_state for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on public.portfolio_state
  to authenticated, service_role;
grant select on public.portfolio_state to anon;

-- One live cash row.
create unique index portfolio_state_singleton on public.portfolio_state ((true));

-- Allocated PowerFund capital ($250k) minus cost of any open positions already booked.
insert into public.portfolio_state (cash, notes)
select
  greatest(
    0,
    250000 - coalesce(
      (select sum(quantity * avg_cost) from public.positions where status = 'open'),
      0
    )
  ),
  'PowerFund allocated NAV $250k. BTC/gold are outside this book.'
where not exists (select 1 from public.portfolio_state);
