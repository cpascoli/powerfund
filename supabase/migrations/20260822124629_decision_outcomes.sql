-- Append-only structured grades for journal rows.
-- Does not write decisions.reviewed_at / outcome_grade (those hide thesis_review).

create type public.decision_thesis_grade as enum (
  'correct',
  'partly_correct',
  'wrong'
);

create type public.decision_quality_grade as enum (
  'good',
  'mixed',
  'poor'
);

create table public.decision_outcomes (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.decisions (id) on delete restrict,
  recorded_at timestamptz not null default timezone('utc', now()),
  thesis_grade public.decision_thesis_grade not null,
  timing_grade public.decision_quality_grade,
  sizing_grade public.decision_quality_grade,
  risk_management_grade public.decision_quality_grade,
  lessons text not null,
  actor_name text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint decision_outcomes_lessons_nonempty
    check (char_length(btrim(lessons)) > 0)
);

create index decision_outcomes_decision_id_idx
  on public.decision_outcomes (decision_id, recorded_at desc);

create or replace function public.decision_outcomes_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'decision_outcomes is append-only; insert a new row instead of updating';
end;
$$;

drop trigger if exists decision_outcomes_no_update on public.decision_outcomes;
create trigger decision_outcomes_no_update
before update on public.decision_outcomes
for each row execute function public.decision_outcomes_append_only();

drop trigger if exists decision_outcomes_no_delete on public.decision_outcomes;
create trigger decision_outcomes_no_delete
before delete on public.decision_outcomes
for each row execute function public.decision_outcomes_append_only();

alter table public.decision_outcomes enable row level security;

create policy "authenticated read decision_outcomes"
  on public.decision_outcomes for select to authenticated using (true);
create policy "operator insert decision_outcomes"
  on public.decision_outcomes for insert to authenticated
  with check ((select public.is_operator()));

grant select, insert on public.decision_outcomes
  to authenticated, service_role;
revoke all privileges on public.decision_outcomes from anon;
revoke update, delete on public.decision_outcomes from authenticated;
