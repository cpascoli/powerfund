-- Intention vs fill: planned buys sit here until confirmed into positions.

create type public.planned_action_type as enum ('buy', 'add', 'reduce', 'sell');
create type public.planned_action_status as enum (
  'pending',
  'deferred',
  'confirmed',
  'cancelled'
);

create table public.planned_actions (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references public.instruments (id) on delete restrict,
  action_type public.planned_action_type not null default 'buy',
  status public.planned_action_status not null default 'pending',
  planned_usd numeric not null check (planned_usd > 0),
  window_label text,
  due_by date,
  rationale text,
  position_id uuid references public.positions (id) on delete set null,
  decision_id uuid references public.decisions (id) on delete set null,
  confirmed_quantity numeric check (confirmed_quantity is null or confirmed_quantity > 0),
  confirmed_price numeric check (confirmed_price is null or confirmed_price >= 0),
  confirmed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger planned_actions_set_updated_at
before update on public.planned_actions
for each row execute function public.set_updated_at();

create index planned_actions_status_idx
  on public.planned_actions (status, created_at desc);
create index planned_actions_instrument_id_idx
  on public.planned_actions (instrument_id);

alter table public.planned_actions enable row level security;

create policy "authenticated read planned_actions"
  on public.planned_actions for select to authenticated using (true);

create policy "authenticated write planned_actions"
  on public.planned_actions for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on public.planned_actions
  to authenticated, service_role;
grant select on public.planned_actions to anon;
