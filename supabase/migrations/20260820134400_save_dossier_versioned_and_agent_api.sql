-- Atomic live-dossier update + conditional immutable version.
-- Agent API idempotency store. dossier_versions become append-only.

create or replace function public.dossier_versions_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'dossier_versions is append-only; save the live dossier to create a new version';
end;
$$;

drop trigger if exists dossier_versions_no_update on public.dossier_versions;
create trigger dossier_versions_no_update
before update on public.dossier_versions
for each row execute function public.dossier_versions_append_only();

drop trigger if exists dossier_versions_no_delete on public.dossier_versions;
create trigger dossier_versions_no_delete
before delete on public.dossier_versions
for each row execute function public.dossier_versions_append_only();

drop policy if exists "operator update dossier_versions" on public.dossier_versions;
drop policy if exists "operator delete dossier_versions" on public.dossier_versions;
revoke update, delete on public.dossier_versions from authenticated;

create or replace function public.save_dossier_versioned(
  p_instrument_id uuid,
  p_fields jsonb,
  p_snapshot jsonb,
  p_change_reason text,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_dossier_id uuid;
  v_current_version integer := 0;
  v_current_version_id uuid;
  v_latest_snapshot jsonb;
  v_new_version integer;
  v_new_version_id uuid;
  v_reason text;
begin
  if p_instrument_id is null then
    raise exception 'UNKNOWN_INSTRUMENT'
      using errcode = 'P0002';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'VALIDATION_ERROR: dossier fields are required'
      using errcode = 'P0001';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'VALIDATION_ERROR: dossier snapshot is required'
      using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_fields->>'summary'), '') = '' then
    raise exception 'VALIDATION_ERROR: summary is required'
      using errcode = 'P0001';
  end if;

  perform 1
  from public.instruments
  where id = p_instrument_id
  for update;
  if not found then
    raise exception 'UNKNOWN_INSTRUMENT'
      using errcode = 'P0002';
  end if;

  select d.id
  into v_dossier_id
  from public.dossiers as d
  where d.instrument_id = p_instrument_id
  for update;

  if v_dossier_id is not null then
    select dv.id, dv.version_number, dv.snapshot
    into v_current_version_id, v_current_version, v_latest_snapshot
    from public.dossier_versions as dv
    where dv.dossier_id = v_dossier_id
    order by dv.version_number desc
    limit 1;
    v_current_version := coalesce(v_current_version, 0);
  end if;

  if p_expected_version is not null
     and p_expected_version is distinct from v_current_version then
    raise exception 'DOSSIER_VERSION_CONFLICT'
      using errcode = 'P0001',
            detail = v_current_version::text;
  end if;

  insert into public.dossiers (
    instrument_id,
    status,
    research_level,
    summary,
    thesis,
    catalysts,
    risks,
    invalidation,
    competitive_notes,
    next_diligence,
    source,
    as_of_at,
    verified_at,
    next_review_at
  )
  values (
    p_instrument_id,
    (p_fields->>'status')::public.dossier_status,
    (p_fields->>'research_level')::public.dossier_research_level,
    p_fields->>'summary',
    p_fields->>'thesis',
    p_fields->>'catalysts',
    p_fields->>'risks',
    p_fields->>'invalidation',
    p_fields->>'competitive_notes',
    p_fields->>'next_diligence',
    p_fields->>'source',
    nullif(p_fields->>'as_of_at', '')::timestamptz,
    nullif(p_fields->>'verified_at', '')::timestamptz,
    nullif(p_fields->>'next_review_at', '')::timestamptz
  )
  on conflict (instrument_id) do update set
    status = excluded.status,
    research_level = excluded.research_level,
    summary = excluded.summary,
    thesis = excluded.thesis,
    catalysts = excluded.catalysts,
    risks = excluded.risks,
    invalidation = excluded.invalidation,
    competitive_notes = excluded.competitive_notes,
    next_diligence = excluded.next_diligence,
    source = excluded.source,
    as_of_at = excluded.as_of_at,
    verified_at = excluded.verified_at,
    next_review_at = excluded.next_review_at
  returning id into v_dossier_id;

  if v_latest_snapshot is not distinct from p_snapshot then
    return jsonb_build_object(
      'changed', false,
      'dossier_id', v_dossier_id,
      'version_id', v_current_version_id,
      'version_number', v_current_version
    );
  end if;

  v_reason := nullif(btrim(coalesce(p_change_reason, '')), '');
  if v_reason is null then
    v_reason := 'dossier update';
  end if;

  v_new_version := v_current_version + 1;
  insert into public.dossier_versions (
    dossier_id,
    version_number,
    snapshot,
    change_reason
  )
  values (
    v_dossier_id,
    v_new_version,
    p_snapshot,
    v_reason
  )
  returning id into v_new_version_id;

  return jsonb_build_object(
    'changed', true,
    'dossier_id', v_dossier_id,
    'version_id', v_new_version_id,
    'version_number', v_new_version,
    'change_reason', v_reason
  );
end;
$$;

revoke all on function public.save_dossier_versioned(uuid, jsonb, jsonb, text, integer)
  from public;
grant execute on function public.save_dossier_versioned(uuid, jsonb, jsonb, text, integer)
  to authenticated, service_role;

create table public.agent_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  key_name text not null,
  idempotency_key text not null,
  operation text not null,
  request_hash text not null,
  status_code integer not null,
  response jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint agent_idempotency_unique unique (key_name, idempotency_key),
  constraint agent_idempotency_key_nonempty check (char_length(idempotency_key) > 0),
  constraint agent_idempotency_hash_nonempty check (char_length(request_hash) > 0)
);

create index agent_idempotency_created_idx
  on public.agent_idempotency_keys (created_at desc);

alter table public.agent_idempotency_keys enable row level security;

grant select, insert, update on public.agent_idempotency_keys to service_role;
revoke all on public.agent_idempotency_keys from anon, authenticated;
