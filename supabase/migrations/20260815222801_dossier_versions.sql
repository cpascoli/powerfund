-- Versioned investment dossiers.
--
-- `dossiers` remains the mutable current header. `dossier_versions` stores
-- immutable assembled snapshots so the journal can cite what was believed at
-- decision time. Existing August 2026 enter rows are intentionally left
-- unlinked: those decisions predate the rewritten dossiers.

create type public.dossier_research_level as enum (
  'draft',
  'screened',
  'primary_verified',
  'investment_ready'
);

alter table public.dossiers
  add column research_level public.dossier_research_level not null default 'draft',
  add column as_of_at timestamptz,
  add column verified_at timestamptz,
  add column next_review_at timestamptz;

create index dossiers_next_review_idx
  on public.dossiers (next_review_at)
  where next_review_at is not null;

create table public.dossier_versions (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers (id) on delete cascade,
  version_number integer not null,
  snapshot jsonb not null,
  change_reason text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint dossier_versions_unique unique (dossier_id, version_number),
  constraint dossier_versions_number_positive check (version_number > 0)
);

create index dossier_versions_dossier_idx
  on public.dossier_versions (dossier_id, version_number desc);

alter table public.decisions
  add column dossier_version_id uuid
    references public.dossier_versions (id) on delete set null;

create index decisions_dossier_version_idx
  on public.decisions (dossier_version_id)
  where dossier_version_id is not null;

alter table public.dossier_versions enable row level security;

create policy "authenticated read dossier_versions"
  on public.dossier_versions for select to authenticated using (true);

create policy "operator insert dossier_versions"
  on public.dossier_versions for insert to authenticated
  with check ((select public.is_operator()));

create policy "operator update dossier_versions"
  on public.dossier_versions for update to authenticated
  using ((select public.is_operator()))
  with check ((select public.is_operator()));

create policy "operator delete dossier_versions"
  on public.dossier_versions for delete to authenticated
  using ((select public.is_operator()));

grant select, insert, update, delete on public.dossier_versions
  to authenticated, service_role;
revoke all privileges on public.dossier_versions from anon;

-- Classify the current live set. Primary-source rewrites from 15 August 2026
-- are marked verified; other investigate notes stay screened.
update public.dossiers as d
set
  research_level = case
    when d.summary ilike '%Primary-source verified%' then
      'primary_verified'::public.dossier_research_level
    when d.status in ('investigate', 'active_thesis') then
      'screened'::public.dossier_research_level
    else
      'draft'::public.dossier_research_level
  end,
  as_of_at = case
    when d.summary ilike '%Valuation basis%' then
      timestamptz '2026-08-14 20:00:00+00'
    else
      d.as_of_at
  end,
  verified_at = case
    when d.summary ilike '%Primary-source verified%' then
      timestamptz '2026-08-15 00:00:00+00'
    else
      d.verified_at
  end,
  next_review_at = case
    when exists (
      select 1
      from public.instruments i
      where i.id = d.instrument_id
        and i.symbol = 'MRCY'
    ) then
      timestamptz '2026-08-18 00:00:00+00'
    when d.summary ilike '%Primary-source verified%' then
      timestamptz '2026-11-15 00:00:00+00'
    else
      d.next_review_at
  end;

insert into public.dossier_versions (
  dossier_id,
  version_number,
  snapshot,
  change_reason
)
select
  d.id,
  1,
  jsonb_build_object(
    'status', d.status,
    'summary', d.summary,
    'thesis', d.thesis,
    'catalysts', d.catalysts,
    'risks', d.risks,
    'invalidation', d.invalidation,
    'competitive_notes', d.competitive_notes,
    'next_diligence', d.next_diligence,
    'source', d.source,
    'research_level', d.research_level,
    'as_of_at', d.as_of_at,
    'verified_at', d.verified_at,
    'next_review_at', d.next_review_at
  ),
  'Snapshot of live dossier as of 2026-08-15'
from public.dossiers as d;
