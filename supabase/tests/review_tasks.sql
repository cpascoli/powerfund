-- Review obligations are distinct from the ledger.
-- Run after seed. Rolls back.

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_mrcy uuid;
  v_energy uuid;
  v_task uuid;
  v_tx_before int;
  v_tx_after int;
  v_raised boolean := false;
begin
  select id into v_mrcy from public.instruments where symbol = 'MRCY';
  select id into v_energy from public.themes where slug = 'energy';
  if v_mrcy is null or v_energy is null then
    raise exception 'FAIL setup: expected seeded MRCY and energy theme';
  end if;

  select count(*) into v_tx_before from public.transactions;

  insert into public.review_tasks (
    title,
    instructions,
    scope,
    priority,
    trigger,
    scheduled_for,
    not_before
  )
  values (
    'SQL test scheduled review',
    'Reassess MRCY after the date.',
    'company',
    'normal',
    jsonb_build_object(
      'type', 'scheduled',
      'at', '2026-08-22T00:00:00Z'
    ),
    timestamptz '2026-08-22 00:00:00+00',
    timestamptz '2026-08-22 00:00:00+00'
  )
  returning id into v_task;

  insert into public.review_task_instruments (review_task_id, instrument_id)
  values (v_task, v_mrcy);

  select count(*) into v_tx_after from public.transactions;
  if v_tx_after <> v_tx_before then
    raise exception 'FAIL: creating a review task must not insert transactions';
  end if;

  begin
    insert into public.review_tasks (
      title, instructions, scope, trigger
    ) values (
      'bad trigger',
      'should fail',
      'macro',
      jsonb_build_object('type', 'javascript')
    );
  exception
    when check_violation then
      v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL: invalid trigger type should be rejected';
  end if;

  v_raised := false;
  begin
    update public.review_tasks
    set status = 'completed'
    where id = v_task;
  exception
    when check_violation then
      v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL: completed without outcome should be rejected';
  end if;

  update public.review_tasks
  set
    status = 'completed',
    completed_at = timezone('utc', now()),
    outcome = 'No change to the book.'
  where id = v_task;

  insert into public.review_task_themes (review_task_id, theme_id)
  values (v_task, v_energy);

  raise notice 'PASS review_tasks schema';
end $$;

rollback;
