-- Behavioural tests for stock splits.
--
-- Run against a local database:
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/corporate_actions.sql
--
-- The claims under test are the ones a split must never break: the money paid
-- does not change, cash does not move, no transaction appears, the fill rows
-- stay as booked, and nothing can be applied twice. Each is asserted through
-- the real trigger chain — a ledger insert, then a status update — rather
-- than by calling a function directly, because the SNDK defect was not a
-- wrong formula. There was no formula; the projection simply never heard.
--
-- Everything runs inside a transaction and rolls back.

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_a uuid;  -- forward split, the SNDK shape
  v_b uuid;  -- reverse split
  v_c uuid;  -- consecutive splits and trades around the effective date
  v_d uuid;  -- sale booked before the split was applied
  v_e uuid;  -- not held
  v_action uuid;
  v_second uuid;
  v_qty numeric;
  v_avg numeric;
  v_cash numeric;
  v_cash_before numeric;
  v_tx_count int;
  v_tx_before int;
  v_realized numeric;
  v_basis numeric;
  v_status text;
  v_failures int;
  v_raised boolean;
  v_row record;
begin
  select id into v_a from public.instruments where symbol = 'NVDA';
  select id into v_b from public.instruments where symbol = 'VRT';
  select id into v_c from public.instruments where symbol = 'ETN';
  select id into v_d from public.instruments where symbol = 'MU';
  select id into v_e from public.instruments where symbol = 'TSM';
  if v_a is null or v_b is null or v_c is null or v_d is null or v_e is null then
    raise exception 'FAIL setup: NVDA, VRT, ETN, MU and TSM must be in the seeded universe';
  end if;

  ---------------------------------------------------------------------------
  -- The SNDK case: 2.28 shares bought for $3,972.81, then an 8-for-1.
  ---------------------------------------------------------------------------
  insert into public.transactions (occurred_at, kind, instrument_id, quantity, price, cash_delta)
  values ('2026-10-01 21:00:00+00', 'buy', v_a, 2.28, 1742.46, -3972.81);

  select cash into v_cash_before from public.portfolio_state limit 1;
  select count(*) into v_tx_before from public.transactions;

  insert into public.corporate_actions (
    instrument_id, effective_date, split_numerator, split_denominator, source
  )
  values (v_a, '2026-11-20', 8, 1, 'manual')
  returning id into v_action;

  -- Registered is not applied. A pending split changes nothing.
  select quantity into v_qty from public.positions where instrument_id = v_a and status = 'open';
  if v_qty <> 2.28 then
    raise exception 'FAIL pending: a pending split moved the position to %', v_qty;
  end if;
  if public.split_factor(v_a, '2026-10-01') <> 1 then
    raise exception 'FAIL pending: split_factor honours a split that is only pending';
  end if;
  raise notice 'PASS a pending split changes nothing';

  -- Applying is a statement that someone checked, and has to say so.
  v_raised := false;
  begin
    update public.corporate_actions set status = 'applied' where id = v_action;
  exception when check_violation then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL verification: a split was applied with no verifier';
  end if;
  raise notice 'PASS applying without verification is refused';

  update public.corporate_actions
     set status = 'applied',
         verified_by = 'test',
         verification_notes = '8-K'
   where id = v_action;

  select quantity, avg_cost into v_qty, v_avg
  from public.positions where instrument_id = v_a and status = 'open';
  if v_qty <> 18.24 then
    raise exception 'FAIL forward split: expected 18.24 units, got %', v_qty;
  end if;
  if round(v_qty * v_avg, 2) <> 3972.81 then
    raise exception 'FAIL forward split: cost basis moved to %', round(v_qty * v_avg, 2);
  end if;
  if round(v_avg, 4) <> round(3972.81 / 18.24, 4) then
    raise exception 'FAIL forward split: average cost % is not basis / units', v_avg;
  end if;
  raise notice 'PASS 8-for-1: 2.28 -> 18.24 units, basis 3,972.81 unchanged';

  -- The invariant in the spec: value before equals value after.
  if 2.28 * 755.16 <> 18.24 * 94.395 then
    raise exception 'FAIL invariant: 2.28 x 755.16 <> 18.24 x 94.395';
  end if;
  if v_qty * 94.395 <> 1721.7648 then
    raise exception 'FAIL invariant: position marks to % at the adjusted close', v_qty * 94.395;
  end if;
  raise notice 'PASS no change in value from the split alone (1,721.7648 both sides)';

  select cash into v_cash from public.portfolio_state limit 1;
  select count(*) into v_tx_count from public.transactions;
  if v_cash <> v_cash_before then
    raise exception 'FAIL forward split: cash moved from % to %', v_cash_before, v_cash;
  end if;
  if v_tx_count <> v_tx_before then
    raise exception 'FAIL forward split: % transaction(s) were written', v_tx_count - v_tx_before;
  end if;
  select quantity, price, cash_delta, basis_delta, realized_pnl into v_row
  from public.transactions where instrument_id = v_a;
  if v_row.quantity <> 2.28 or v_row.price <> 1742.46
     or v_row.cash_delta <> -3972.81 or v_row.basis_delta <> 3972.81
     or v_row.realized_pnl is not null then
    raise exception 'FAIL forward split: the original fill was rewritten';
  end if;
  raise notice 'PASS no cash moved, no transaction written, the fill is as booked';

  select count(*) into v_failures from public.verify_book_against_ledger() where not ok;
  if v_failures <> 0 then
    raise exception 'FAIL reconcile: % check(s) fail after the split', v_failures;
  end if;
  raise notice 'PASS the book reconciles to the ledger on the new basis';

  -- Prose cannot be restated, so applying opens exactly one review, already
  -- due, for the per-share figures a human has to restate.
  select count(*) into v_tx_count
  from public.review_tasks t
  join public.review_task_instruments l on l.review_task_id = t.id
  where l.instrument_id = v_a
    and t.created_by = 'system:corporate-action'
    and t.status = 'due'
    and t.became_due_at is not null
    and t.title like '%8-for-1%';
  if v_tx_count <> 1 then
    raise exception 'FAIL research flag: expected 1 due split review for the name, found %', v_tx_count;
  end if;
  if exists (select 1 from public.planned_actions where instrument_id = v_a) then
    raise exception 'FAIL research flag: applying a split created a planned action';
  end if;
  raise notice 'PASS applying opens one due review to restate per-share research, and no trade';

  ---------------------------------------------------------------------------
  -- Nothing can be applied twice.
  ---------------------------------------------------------------------------
  v_raised := false;
  begin
    update public.corporate_actions set notes = 'again' where id = v_action;
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL idempotency: an applied split accepted an update';
  end if;

  v_raised := false;
  begin
    update public.corporate_actions set status = 'pending' where id = v_action;
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL idempotency: an applied split was reopened';
  end if;

  v_raised := false;
  begin
    insert into public.corporate_actions (
      instrument_id, effective_date, split_numerator, split_denominator, source
    )
    values (v_a, '2026-11-20', 8, 1, 'vendor_event');
  exception when unique_violation then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL idempotency: the same split was registered twice';
  end if;

  v_raised := false;
  begin
    insert into public.corporate_actions (
      instrument_id, effective_date, split_numerator, split_denominator, source,
      status, verified_by, verification_notes, applied_at
    )
    values (v_a, '2026-11-23', 8, 1, 'manual', 'applied', 'x', 'y', now());
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL idempotency: a split was inserted already applied, skipping the re-projection';
  end if;

  v_raised := false;
  begin
    delete from public.corporate_actions where id = v_action;
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL idempotency: an applied split was deleted';
  end if;

  select quantity into v_qty from public.positions where instrument_id = v_a and status = 'open';
  if v_qty <> 18.24 then
    raise exception 'FAIL idempotency: the position moved to % after refused writes', v_qty;
  end if;
  raise notice 'PASS an applied split is immutable, unique, and cannot be inserted pre-applied';

  ---------------------------------------------------------------------------
  -- A sale after the split uses the restated average cost, and a full exit
  -- still takes the basis to exactly zero.
  ---------------------------------------------------------------------------
  insert into public.transactions (occurred_at, kind, instrument_id, quantity, price, cash_delta)
  values ('2026-11-23 16:00:00+00', 'sell', v_a, 8.24, 100, 824.00);

  select realized_pnl, basis_delta into v_realized, v_basis
  from public.transactions where instrument_id = v_a and kind = 'sell';
  -- 8.24 units x (3,972.81 / 18.24) = 1,794.73... of basis leaves.
  if round(v_basis, 2) <> round(-8.24 * 3972.81 / 18.24, 2) then
    raise exception 'FAIL sell after split: basis out %', v_basis;
  end if;
  if round(v_realized, 2) <> round(824.00 - 8.24 * 3972.81 / 18.24, 2) then
    raise exception 'FAIL sell after split: realised %', v_realized;
  end if;

  insert into public.transactions (occurred_at, kind, instrument_id, quantity, price, cash_delta)
  values ('2026-11-24 16:00:00+00', 'sell', v_a, 10, 100, 1000.00);

  select status into v_status from public.positions where instrument_id = v_a order by updated_at desc limit 1;
  select sum(basis_delta) into v_basis from public.transactions where instrument_id = v_a;
  if v_status <> 'closed' then
    raise exception 'FAIL exit after split: selling all 18.24 units left the position %', v_status;
  end if;
  if round(v_basis, 6) <> 0 then
    raise exception 'FAIL exit after split: ledger basis sums to %, not zero', v_basis;
  end if;
  select sum(realized_pnl) into v_realized from public.transactions where instrument_id = v_a;
  if round(v_realized, 2) <> round(1824.00 - 3972.81, 2) then
    raise exception 'FAIL exit after split: total realised % is not proceeds less cost', v_realized;
  end if;
  raise notice 'PASS partial and full exits after a split realise proceeds less the original cost';

  ---------------------------------------------------------------------------
  -- Reverse split, on a position built from two purchases with a partial
  -- disposal before it.
  ---------------------------------------------------------------------------
  insert into public.transactions (occurred_at, kind, instrument_id, quantity, price, cash_delta)
  values
    ('2026-01-05 15:00:00+00', 'buy', v_b, 30, 10, -300.00),
    ('2026-02-05 15:00:00+00', 'buy', v_b, 20, 20, -400.00);
  insert into public.transactions (occurred_at, kind, instrument_id, quantity, price, cash_delta)
  values ('2026-03-05 15:00:00+00', 'sell', v_b, 10, 30, 300.00);
  -- 40 units at 14 = 560 of basis remain.

  insert into public.corporate_actions (
    instrument_id, effective_date, split_numerator, split_denominator, source
  )
  values (v_b, '2026-04-01', 1, 10, 'manual')
  returning id into v_action;

  -- A reverse split has to say what the broker did with the fraction.
  v_raised := false;
  begin
    update public.corporate_actions
       set status = 'applied', verified_by = 'test', verification_notes = 'notice'
     where id = v_action;
  exception when check_violation then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL reverse split: applied without stating the fractional treatment';
  end if;

  update public.corporate_actions
     set status = 'applied', verified_by = 'test', verification_notes = 'notice',
         fractional_treatment = 'retained'
   where id = v_action;

  select quantity, avg_cost into v_qty, v_avg
  from public.positions where instrument_id = v_b and status = 'open';
  if v_qty <> 4 or v_avg <> 140 then
    raise exception 'FAIL reverse split: expected 4 @ 140, got % @ %', v_qty, v_avg;
  end if;
  select realized_pnl into v_realized
  from public.transactions where instrument_id = v_b and kind = 'sell';
  if v_realized <> 160 then
    raise exception 'FAIL reverse split: the pre-split sale''s realised P&L changed to %', v_realized;
  end if;
  raise notice 'PASS 1-for-10: 40 -> 4 units, basis 560 unchanged, earlier realised P&L untouched';

  ---------------------------------------------------------------------------
  -- Trades around the effective date, a split applied late, a second split,
  -- and a trade that turns up dated before one already applied.
  ---------------------------------------------------------------------------
  -- 21:00 New York on the 19th is 02:00 UTC on the 20th: still the old basis.
  insert into public.transactions (occurred_at, kind, instrument_id, quantity, price, cash_delta)
  values ('2026-11-20 02:00:00+00', 'buy', v_c, 10, 300, -3000.00);
  -- 09:30 New York on the effective date: already the new basis.
  insert into public.transactions (occurred_at, kind, instrument_id, quantity, price, cash_delta)
  values ('2026-11-20 14:30:00+00', 'buy', v_c, 5, 100, -500.00);

  if public.trade_session('2026-11-20 02:00:00+00') <> date '2026-11-19'
     or public.trade_session('2026-11-20 14:30:00+00') <> date '2026-11-20' then
    raise exception 'FAIL session: the effective-date boundary is not the New York day';
  end if;

  insert into public.corporate_actions (
    instrument_id, effective_date, split_numerator, split_denominator, source
  )
  values (v_c, '2026-11-20', 3, 1, 'price_rebase')
  returning id into v_action;
  update public.corporate_actions
     set status = 'applied', verified_by = 'test', verification_notes = 'late'
   where id = v_action;

  -- Only the first buy is scaled: 10 x 3 + 5, not 15 x 3.
  select quantity, avg_cost into v_qty, v_avg
  from public.positions where instrument_id = v_c and status = 'open';
  -- Average cost is basis / units, a numeric division; compare the money.
  if v_qty <> 35 or round(v_qty * v_avg, 2) <> 3500.00 then
    raise exception 'FAIL late apply: expected 35 units carrying 3,500.00, got % @ %', v_qty, v_avg;
  end if;
  raise notice 'PASS a split applied after a post-split buy scales only the pre-split units';

  -- A second split stacks on the first: 35 x 3/2 = 52.5.
  insert into public.corporate_actions (
    instrument_id, effective_date, split_numerator, split_denominator, source
  )
  values (v_c, '2026-12-10', 3, 2, 'manual')
  returning id into v_second;
  update public.corporate_actions
     set status = 'applied', verified_by = 'test', verification_notes = 'second'
   where id = v_second;

  select quantity into v_qty from public.positions where instrument_id = v_c and status = 'open';
  if v_qty <> 52.5 then
    raise exception 'FAIL consecutive splits: expected 52.5 units, got %', v_qty;
  end if;
  if public.split_factor(v_c, '2026-11-19') <> 4.5
     or public.split_factor(v_c, '2026-11-20') <> 1.5
     or public.split_factor(v_c, '2026-12-10') <> 1 then
    raise exception 'FAIL consecutive splits: split_factor is not the product of the later splits';
  end if;
  raise notice 'PASS consecutive splits compound: 10 -> 30 -> 45, 5 -> 7.5';

  -- A fill that happened between the two splits, booked only now. It is
  -- recorded as it happened (2 units) and projected on today's basis (3).
  insert into public.transactions (occurred_at, kind, instrument_id, quantity, price, cash_delta)
  values ('2026-12-01 15:00:00+00', 'buy', v_c, 2, 100, -200.00);

  select quantity into v_qty from public.positions where instrument_id = v_c and status = 'open';
  if v_qty <> 55.5 then
    raise exception 'FAIL back-dated fill: expected 55.5 units, got %', v_qty;
  end if;
  select quantity into v_qty from public.transactions
  where instrument_id = v_c and occurred_at = '2026-12-01 15:00:00+00';
  if v_qty <> 2 then
    raise exception 'FAIL back-dated fill: the booked quantity was rewritten to %', v_qty;
  end if;

  -- Fractional units and a sale on the new basis.
  insert into public.transactions (occurred_at, kind, instrument_id, quantity, price, cash_delta)
  values ('2026-12-11 15:00:00+00', 'sell', v_c, 0.12345678, 70, 8.64);
  select quantity into v_qty from public.positions where instrument_id = v_c and status = 'open';
  if v_qty <> 55.37654322 then
    raise exception 'FAIL fractional: expected 55.37654322 units, got %', v_qty;
  end if;

  select count(*) into v_failures from public.verify_book_against_ledger() where not ok;
  if v_failures <> 0 then
    raise exception 'FAIL reconcile: % check(s) fail after trades around two splits', v_failures;
  end if;
  raise notice 'PASS trades before, between and after two splits reconcile, fractions included';

  ---------------------------------------------------------------------------
  -- A sale booked on the new basis before the split was applied cannot be
  -- re-projected around: its realised P&L is already wrong and immutable.
  ---------------------------------------------------------------------------
  insert into public.transactions (occurred_at, kind, instrument_id, quantity, price, cash_delta)
  values ('2026-11-02 15:00:00+00', 'buy', v_d, 10, 800, -8000.00);
  insert into public.transactions (occurred_at, kind, instrument_id, quantity, price, cash_delta)
  values ('2026-11-23 15:00:00+00', 'sell', v_d, 4, 100, 400.00);

  insert into public.corporate_actions (
    instrument_id, effective_date, split_numerator, split_denominator, source
  )
  values (v_d, '2026-11-20', 8, 1, 'manual')
  returning id into v_action;

  v_raised := false;
  begin
    update public.corporate_actions
       set status = 'applied', verified_by = 'test', verification_notes = 'x'
     where id = v_action;
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL late sale: a split was applied over a sale booked on a mixed basis';
  end if;
  select status into v_status from public.corporate_actions where id = v_action;
  if v_status <> 'pending' then
    raise exception 'FAIL late sale: the refused split is %, not still pending', v_status;
  end if;
  raise notice 'PASS a split is refused when a post-split sale was booked before it was applied';

  -- Rejecting leaves the book alone and frees the event to be registered again.
  update public.corporate_actions set status = 'rejected' where id = v_action;
  if exists (
    select 1 from public.review_task_instruments l
    join public.review_tasks t on t.id = l.review_task_id
    where l.instrument_id = v_d and t.created_by = 'system:corporate-action'
  ) then
    raise exception 'FAIL reject: a refused or rejected split opened a review';
  end if;
  select quantity into v_qty from public.positions where instrument_id = v_d and status = 'open';
  if v_qty <> 6 then
    raise exception 'FAIL reject: rejecting a split moved the position to %', v_qty;
  end if;
  insert into public.corporate_actions (
    instrument_id, effective_date, split_numerator, split_denominator, source
  )
  values (v_d, '2026-11-20', 8, 1, 'manual');
  raise notice 'PASS a rejected split changes nothing and can be registered again';

  ---------------------------------------------------------------------------
  -- A name we do not hold: the split is recorded, nothing is projected.
  ---------------------------------------------------------------------------
  insert into public.corporate_actions (
    instrument_id, effective_date, split_numerator, split_denominator, source
  )
  values (v_e, '2026-11-20', 2, 1, 'vendor_event')
  returning id into v_action;
  update public.corporate_actions
     set status = 'applied', verified_by = 'test', verification_notes = 'x'
   where id = v_action;
  if exists (select 1 from public.positions where instrument_id = v_e) then
    raise exception 'FAIL unheld: applying a split created a position';
  end if;
  if public.split_factor(v_e, '2026-11-19') <> 2 then
    raise exception 'FAIL unheld: an applied split on an unheld name has no factor';
  end if;
  raise notice 'PASS a split on an unheld name is recorded without touching the book';

  ---------------------------------------------------------------------------
  -- Shape constraints.
  ---------------------------------------------------------------------------
  v_raised := false;
  begin
    insert into public.corporate_actions (
      instrument_id, effective_date, split_numerator, split_denominator, source
    )
    values (v_e, '2026-11-21', 2, 1, 'manual');  -- a Saturday
  exception when check_violation then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL shape: a split took effect on a Saturday';
  end if;

  v_raised := false;
  begin
    insert into public.corporate_actions (
      instrument_id, effective_date, split_numerator, split_denominator, source
    )
    values (v_e, '2026-12-01', 1, 1, 'manual');
  exception when check_violation then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL shape: a 1-for-1 split was accepted';
  end if;
  raise notice 'PASS weekend effective dates and 1-for-1 ratios are refused';

  ---------------------------------------------------------------------------
  -- The guards are present and armed, and visible to verify:book.
  ---------------------------------------------------------------------------
  select count(*) into v_failures
  from (
    select unnest(array[
      'corporate_actions_insert_pending',
      'corporate_actions_settle',
      'corporate_actions_no_delete'
    ]) as name
  ) wanted
  where not exists (
    select 1 from public.ledger_guard_status() g
    where g.table_name = 'corporate_actions'
      and g.trigger_name = wanted.name
      and g.enabled
  );
  if v_failures <> 0 then
    raise exception 'FAIL guards: % corporate-action guard(s) missing or disabled', v_failures;
  end if;
  raise notice 'PASS the corporate-action guards are armed and reported';

  -- anon may read nothing here, and may not ask for a factor.
  if has_table_privilege('anon', 'public.corporate_actions', 'select') then
    raise exception 'FAIL access: anon can read corporate_actions';
  end if;
  if has_function_privilege('anon', 'public.split_factor(uuid, date)', 'execute') then
    raise exception 'FAIL access: anon can execute split_factor()';
  end if;
  raise notice 'PASS anon has no access to corporate actions';
end;
$$;

rollback;
