create type public.dossier_status as enum (
  'watch',
  'investigate',
  'active_thesis',
  'passed'
);

create table public.dossiers (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null unique references public.instruments (id) on delete cascade,
  status public.dossier_status not null default 'watch',
  summary text not null,
  thesis text,
  catalysts text,
  risks text,
  invalidation text,
  competitive_notes text,
  next_diligence text,
  source text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger dossiers_set_updated_at
before update on public.dossiers
for each row execute function public.set_updated_at();

create index dossiers_status_idx on public.dossiers (status);

alter table public.dossiers enable row level security;

create policy "authenticated read dossiers"
  on public.dossiers for select to authenticated using (true);

create policy "authenticated write dossiers"
  on public.dossiers for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on public.dossiers
  to authenticated, service_role;
grant select on public.dossiers to anon;
