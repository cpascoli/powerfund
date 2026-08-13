-- Fixes "UPDATE requires a WHERE clause", which made every ledger write fail
-- from the app while passing in tests.
--
-- Supabase's `authenticator` role — the one PostgREST connects as before
-- switching to `authenticated` — preloads `safeupdate`, which rejects any UPDATE
-- or DELETE without a WHERE clause. `apply_transaction` updated the singleton
-- cash row without one, so inserting any transaction through the API aborted.
--
-- The tests missed it because they run as `postgres` via psql, where safeupdate
-- is not preloaded. A regression check in supabase/tests/ledger.sql now asserts
-- that no function contains a WHERE-less UPDATE, which does not depend on
-- reproducing the role's library preload.
--
-- Taking `for update` on the row also serialises concurrent cash updates
-- explicitly rather than relying on the UPDATE's own lock.

create or replace function public.apply_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_position public.positions;
  v_state_id uuid;
  v_latest timestamptz;
  v_cost numeric;
  v_new_quantity numeric;
  v_new_basis numeric;
  v_basis_out numeric;
begin
  if new.kind in ('buy', 'sell') then
    -- Average cost is path dependent, so the projection is only correct when
    -- trades arrive in order. Back-dating needs a rebuild, so refuse it loudly
    -- rather than silently computing the wrong average.
    select max(occurred_at) into v_latest
    from public.transactions
    where instrument_id = new.instrument_id
      and kind in ('buy', 'sell');

    if v_latest is not null and new.occurred_at < v_latest then
      raise exception
        'cannot post a trade dated % before the latest trade for this instrument (%)',
        new.occurred_at, v_latest;
    end if;
  end if;

  select id into v_state_id
  from public.portfolio_state
  limit 1
  for update;

  if v_state_id is null then
    insert into public.portfolio_state (cash) values (new.cash_delta);
  else
    update public.portfolio_state
       set cash = cash + new.cash_delta
     where id = v_state_id;
  end if;

  if new.kind = 'buy' then
    -- Cash out (fees included) is the cost basis added.
    v_cost := -new.cash_delta;
    new.basis_delta := v_cost;

    select * into v_position
    from public.positions
    where instrument_id = new.instrument_id and status = 'open'
    for update;

    if v_position.id is null then
      insert into public.positions (
        instrument_id, status, side, quantity, avg_cost, opened_at, thesis_summary
      )
      values (
        new.instrument_id, 'open', 'long', new.quantity,
        v_cost / new.quantity, new.occurred_at, new.notes
      );
    else
      v_new_quantity := v_position.quantity + new.quantity;
      v_new_basis := v_position.quantity * v_position.avg_cost + v_cost;
      update public.positions
         set quantity = v_new_quantity,
             avg_cost = v_new_basis / v_new_quantity
       where id = v_position.id;
    end if;

  elsif new.kind = 'sell' then
    select * into v_position
    from public.positions
    where instrument_id = new.instrument_id and status = 'open'
    for update;

    if v_position.id is null then
      raise exception 'no open position to sell for instrument %', new.instrument_id;
    end if;

    if new.quantity > v_position.quantity then
      raise exception 'cannot sell % units; only % held',
        new.quantity, v_position.quantity;
    end if;

    -- Average cost pooling: avg_cost is unchanged by a sale. A full exit removes
    -- the entire remaining basis so the ledger sums to exactly zero.
    if new.quantity = v_position.quantity then
      v_basis_out := v_position.quantity * v_position.avg_cost;
    else
      v_basis_out := new.quantity * v_position.avg_cost;
    end if;

    new.basis_delta := -v_basis_out;
    new.realized_pnl := new.cash_delta - v_basis_out;

    v_new_quantity := v_position.quantity - new.quantity;

    if v_new_quantity = 0 then
      update public.positions
         set quantity = 0,
             status = 'closed',
             closed_at = new.occurred_at
       where id = v_position.id;
    else
      update public.positions
         set quantity = v_new_quantity
       where id = v_position.id;
    end if;
  end if;

  return new;
end;
$$;
