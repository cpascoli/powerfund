-- Review obligations are first-class and distinct from planned trades.
-- A trigger may mark a task due; it must never create a transaction.

create type public.review_task_status as enum (
  'pending',
  'due',
  'in_progress',
  'completed',
  'deferred',
  'cancelled'
);

create type public.review_task_scope as enum (
  'company',
  'theme',
  'portfolio',
  'macro'
);

create type public.review_task_priority as enum (
  'low',
  'normal',
  'high',
  'urgent'
);

create type public.review_output_kind as enum (
  'dossier_version',
  'decision',
  'planned_action'
);

create table public.review_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  instructions text not null,
  scope public.review_task_scope not null,
  priority public.review_task_priority not null default 'normal',
  status public.review_task_status not null default 'pending',
  trigger jsonb not null,
  created_by text not null default 'operator',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  scheduled_for timestamptz,
  not_before timestamptz,
  due_by timestamptz,
  became_due_at timestamptz,
  completed_at timestamptz,
  outcome text,
  constraint review_tasks_title_nonempty check (char_length(btrim(title)) > 0),
  constraint review_tasks_instructions_nonempty check (char_length(btrim(instructions)) > 0),
  constraint review_tasks_trigger_object check (jsonb_typeof(trigger) = 'object'),
  constraint review_tasks_trigger_type check (
    trigger->>'type' in ('scheduled', 'event_window', 'condition')
  ),
  constraint review_tasks_completed_consistency check (
    (
      status = 'completed'
      and completed_at is not null
      and outcome is not null
      and char_length(btrim(outcome)) > 0
    )
    or (
      status <> 'completed'
      and completed_at is null
    )
  )
);

create trigger review_tasks_set_updated_at
before update on public.review_tasks
for each row execute function public.set_updated_at();

create index review_tasks_status_idx
  on public.review_tasks (status, created_at desc);
create index review_tasks_scheduled_for_idx
  on public.review_tasks (scheduled_for)
  where scheduled_for is not null;
create index review_tasks_due_by_idx
  on public.review_tasks (due_by)
  where due_by is not null;
create index review_tasks_became_due_idx
  on public.review_tasks (became_due_at)
  where became_due_at is not null;

create table public.review_task_instruments (
  review_task_id uuid not null references public.review_tasks (id) on delete cascade,
  instrument_id uuid not null references public.instruments (id) on delete restrict,
  primary key (review_task_id, instrument_id)
);

create index review_task_instruments_instrument_idx
  on public.review_task_instruments (instrument_id);

create table public.review_task_themes (
  review_task_id uuid not null references public.review_tasks (id) on delete cascade,
  theme_id uuid not null references public.themes (id) on delete restrict,
  primary key (review_task_id, theme_id)
);

create index review_task_themes_theme_idx
  on public.review_task_themes (theme_id);

create table public.review_task_outputs (
  id uuid primary key default gen_random_uuid(),
  review_task_id uuid not null references public.review_tasks (id) on delete cascade,
  kind public.review_output_kind not null,
  entity_id uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint review_task_outputs_unique unique (review_task_id, kind, entity_id)
);

create index review_task_outputs_task_idx
  on public.review_task_outputs (review_task_id, created_at);

alter table public.review_tasks enable row level security;
alter table public.review_task_instruments enable row level security;
alter table public.review_task_themes enable row level security;
alter table public.review_task_outputs enable row level security;

create policy "authenticated read review_tasks"
  on public.review_tasks for select to authenticated using (true);
create policy "operator insert review_tasks"
  on public.review_tasks for insert to authenticated
  with check ((select public.is_operator()));
create policy "operator update review_tasks"
  on public.review_tasks for update to authenticated
  using ((select public.is_operator()))
  with check ((select public.is_operator()));
create policy "operator delete review_tasks"
  on public.review_tasks for delete to authenticated
  using ((select public.is_operator()));

create policy "authenticated read review_task_instruments"
  on public.review_task_instruments for select to authenticated using (true);
create policy "operator insert review_task_instruments"
  on public.review_task_instruments for insert to authenticated
  with check ((select public.is_operator()));
create policy "operator update review_task_instruments"
  on public.review_task_instruments for update to authenticated
  using ((select public.is_operator()))
  with check ((select public.is_operator()));
create policy "operator delete review_task_instruments"
  on public.review_task_instruments for delete to authenticated
  using ((select public.is_operator()));

create policy "authenticated read review_task_themes"
  on public.review_task_themes for select to authenticated using (true);
create policy "operator insert review_task_themes"
  on public.review_task_themes for insert to authenticated
  with check ((select public.is_operator()));
create policy "operator update review_task_themes"
  on public.review_task_themes for update to authenticated
  using ((select public.is_operator()))
  with check ((select public.is_operator()));
create policy "operator delete review_task_themes"
  on public.review_task_themes for delete to authenticated
  using ((select public.is_operator()));

create policy "authenticated read review_task_outputs"
  on public.review_task_outputs for select to authenticated using (true);
create policy "operator insert review_task_outputs"
  on public.review_task_outputs for insert to authenticated
  with check ((select public.is_operator()));
create policy "operator update review_task_outputs"
  on public.review_task_outputs for update to authenticated
  using ((select public.is_operator()))
  with check ((select public.is_operator()));
create policy "operator delete review_task_outputs"
  on public.review_task_outputs for delete to authenticated
  using ((select public.is_operator()));

grant select, insert, update, delete on public.review_tasks
  to authenticated, service_role;
grant select, insert, update, delete on public.review_task_instruments
  to authenticated, service_role;
grant select, insert, update, delete on public.review_task_themes
  to authenticated, service_role;
grant select, insert, update, delete on public.review_task_outputs
  to authenticated, service_role;

revoke all privileges on public.review_tasks from anon;
revoke all privileges on public.review_task_instruments from anon;
revoke all privileges on public.review_task_themes from anon;
revoke all privileges on public.review_task_outputs from anon;
