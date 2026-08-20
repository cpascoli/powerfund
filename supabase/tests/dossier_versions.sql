-- Behavioural tests for atomic dossier versioning.
--
-- Run after ledger.sql (or independently). Rolls back.

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_mrcy uuid;
  v_dossier uuid;
  v_before int;
  v_after int;
  v_result jsonb;
  v_summary text;
  v_live_summary text;
  v_raised boolean := false;
  v_current int;
begin
  select id into v_mrcy from public.instruments where symbol = 'MRCY';
  if v_mrcy is null then
    raise exception 'FAIL setup: MRCY not in the seeded universe';
  end if;

  select d.id into v_dossier from public.dossiers d where d.instrument_id = v_mrcy;
  select coalesce(max(version_number), 0) into v_before
  from public.dossier_versions
  where dossier_id = v_dossier;

  select summary into v_summary from public.dossiers where id = v_dossier;

  ---------------------------------------------------------------------------
  -- A material change updates the live row and inserts exactly one version.
  ---------------------------------------------------------------------------
  v_result := public.save_dossier_versioned(
    v_mrcy,
    jsonb_build_object(
      'status', 'investigate',
      'research_level', 'screened',
      'summary', v_summary || ' [agent test change]',
      'thesis', 'test thesis',
      'catalysts', null,
      'risks', null,
      'invalidation', null,
      'competitive_notes', null,
      'next_diligence', null,
      'source', null,
      'as_of_at', null,
      'verified_at', null,
      'next_review_at', null
    ),
    jsonb_build_object(
      'status', 'investigate',
      'research_level', 'screened',
      'summary', v_summary || ' [agent test change]',
      'thesis', 'test thesis',
      'catalysts', null,
      'risks', null,
      'invalidation', null,
      'competitive_notes', null,
      'next_diligence', null,
      'source', null,
      'as_of_at', null,
      'verified_at', null,
      'next_review_at', null
    ),
    'sql test material change',
    null
  );

  if coalesce(v_result->>'changed', 'false') <> 'true' then
    raise exception 'FAIL material change: expected changed=true, got %', v_result;
  end if;

  select count(*) into v_after
  from public.dossier_versions
  where dossier_id = v_dossier;
  if v_after <> v_before + 1 then
    raise exception 'FAIL material change: expected % versions, got %', v_before + 1, v_after;
  end if;
  raise notice 'PASS material change creates exactly one new dossier version';

  ---------------------------------------------------------------------------
  -- Identical assembled snapshot creates no version.
  ---------------------------------------------------------------------------
  v_before := v_after;
  v_result := public.save_dossier_versioned(
    v_mrcy,
    jsonb_build_object(
      'status', 'investigate',
      'research_level', 'screened',
      'summary', v_summary || ' [agent test change]',
      'thesis', 'test thesis',
      'catalysts', null,
      'risks', null,
      'invalidation', null,
      'competitive_notes', null,
      'next_diligence', null,
      'source', null,
      'as_of_at', null,
      'verified_at', null,
      'next_review_at', null
    ),
    jsonb_build_object(
      'status', 'investigate',
      'research_level', 'screened',
      'summary', v_summary || ' [agent test change]',
      'thesis', 'test thesis',
      'catalysts', null,
      'risks', null,
      'invalidation', null,
      'competitive_notes', null,
      'next_diligence', null,
      'source', null,
      'as_of_at', null,
      'verified_at', null,
      'next_review_at', null
    ),
    'sql test identical',
    null
  );
  if coalesce(v_result->>'changed', 'true') <> 'false' then
    raise exception 'FAIL identical snapshot: expected changed=false, got %', v_result;
  end if;
  select count(*) into v_after from public.dossier_versions where dossier_id = v_dossier;
  if v_after <> v_before then
    raise exception 'FAIL identical snapshot created a version';
  end if;
  raise notice 'PASS identical assembled snapshot creates no dossier version';

  ---------------------------------------------------------------------------
  -- expected_version conflict does not mutate the live dossier.
  ---------------------------------------------------------------------------
  select summary into v_live_summary from public.dossiers where id = v_dossier;
  select coalesce(max(version_number), 0) into v_current
  from public.dossier_versions where dossier_id = v_dossier;
  begin
    perform public.save_dossier_versioned(
      v_mrcy,
      jsonb_build_object(
        'status', 'investigate',
        'research_level', 'screened',
        'summary', 'should not persist',
        'thesis', 'test thesis',
        'catalysts', null,
        'risks', null,
        'invalidation', null,
        'competitive_notes', null,
        'next_diligence', null,
        'source', null,
        'as_of_at', null,
        'verified_at', null,
        'next_review_at', null
      ),
      jsonb_build_object(
        'status', 'investigate',
        'research_level', 'screened',
        'summary', 'should not persist',
        'thesis', 'test thesis',
        'catalysts', null,
        'risks', null,
        'invalidation', null,
        'competitive_notes', null,
        'next_diligence', null,
        'source', null,
        'as_of_at', null,
        'verified_at', null,
        'next_review_at', null
      ),
      'sql test conflict',
      v_current - 1
    );
  exception
    when others then
      if sqlerrm like '%DOSSIER_VERSION_CONFLICT%' then
        v_raised := true;
      else
        raise;
      end if;
  end;
  if not v_raised then
    raise exception 'FAIL conflict: expected DOSSIER_VERSION_CONFLICT';
  end if;
  if (select summary from public.dossiers where id = v_dossier) is distinct from v_live_summary then
    raise exception 'FAIL conflict: live dossier mutated';
  end if;
  if (select count(*) from public.dossier_versions where dossier_id = v_dossier) <> v_after then
    raise exception 'FAIL conflict: version inserted';
  end if;
  raise notice 'PASS version conflict raises and does not mutate';

  ---------------------------------------------------------------------------
  -- If version insert fails, the live update rolls back.
  ---------------------------------------------------------------------------
  v_live_summary := (select summary from public.dossiers where id = v_dossier);
  create or replace function pg_temp.boom_versions()
  returns trigger
  language plpgsql
  as $t$
  begin
    raise exception 'forced version insert failure';
  end;
  $t$;
  create trigger boom_versions
  before insert on public.dossier_versions
  for each row execute function pg_temp.boom_versions();

  v_raised := false;
  begin
    perform public.save_dossier_versioned(
      v_mrcy,
      jsonb_build_object(
        'status', 'investigate',
        'research_level', 'screened',
        'summary', 'rollback please',
        'thesis', 'test thesis',
        'catalysts', null,
        'risks', null,
        'invalidation', null,
        'competitive_notes', null,
        'next_diligence', null,
        'source', null,
        'as_of_at', null,
        'verified_at', null,
        'next_review_at', null
      ),
      jsonb_build_object(
        'status', 'investigate',
        'research_level', 'screened',
        'summary', 'rollback please',
        'thesis', 'test thesis',
        'catalysts', null,
        'risks', null,
        'invalidation', null,
        'competitive_notes', null,
        'next_diligence', null,
        'source', null,
        'as_of_at', null,
        'verified_at', null,
        'next_review_at', null
      ),
      'sql test rollback',
      null
    );
  exception
    when others then
      if sqlerrm like '%forced version insert failure%' then
        v_raised := true;
      else
        raise;
      end if;
  end;
  drop trigger boom_versions on public.dossier_versions;
  if not v_raised then
    raise exception 'FAIL rollback: version insert did not fail';
  end if;
  if (select summary from public.dossiers where id = v_dossier) is distinct from v_live_summary then
    raise exception 'FAIL rollback: live dossier kept the failed write';
  end if;
  raise notice 'PASS version insert failure rolls back the live dossier update';

  ---------------------------------------------------------------------------
  -- A decision pin is stable after a later dossier update.
  ---------------------------------------------------------------------------
  insert into public.decisions (
    instrument_id, decision_type, thesis, dossier_version_id, action_at
  )
  values (
    v_mrcy,
    'hold',
    'Pinned version test',
    (v_result->>'version_id')::uuid,
    timezone('utc', now())
  );

  perform public.save_dossier_versioned(
    v_mrcy,
    jsonb_build_object(
      'status', 'investigate',
      'research_level', 'screened',
      'summary', v_summary || ' [later update]',
      'thesis', 'later',
      'catalysts', null,
      'risks', null,
      'invalidation', null,
      'competitive_notes', null,
      'next_diligence', null,
      'source', null,
      'as_of_at', null,
      'verified_at', null,
      'next_review_at', null
    ),
    jsonb_build_object(
      'status', 'investigate',
      'research_level', 'screened',
      'summary', v_summary || ' [later update]',
      'thesis', 'later',
      'catalysts', null,
      'risks', null,
      'invalidation', null,
      'competitive_notes', null,
      'next_diligence', null,
      'source', null,
      'as_of_at', null,
      'verified_at', null,
      'next_review_at', null
    ),
    'sql test later update',
    null
  );

  if (
    select d.dossier_version_id
    from public.decisions d
    where d.thesis = 'Pinned version test'
    order by created_at desc
    limit 1
  ) is distinct from (v_result->>'version_id')::uuid then
    raise exception 'FAIL pin: later dossier update moved the decision pin';
  end if;
  raise notice 'PASS historical decision keeps its pinned dossier version';
end $$;

rollback;
