-- Corporate actions: stock splits as a recorded, verified, applied-once event.
--
-- Sandisk split eight-for-one in November 2026. The market-data side already
-- knew what to do: every vendor restates a series' whole history when a split
-- takes effect, ingest noticed (`detectPriceRebase`) and refetched five years
-- of SNDK closes on the new basis. The ledger side had no idea a split was a
-- thing. `positions` still said 2.28 shares, the snapshot job multiplied 2.28
-- by a $94 close, and the book reported a $1,500 loss that never happened — in
-- every NAV snapshot back to the October fill, because the series is rebuilt
-- from the ledger nightly.
--
-- The convention this migration establishes:
--
--   * `market_bars` is on the vendor's current share basis. Always.
--   * `transactions` is what happened, on the basis it happened on. Never
--     rewritten: 2.28 shares at $1,742.46 stays 2.28 at $1,742.46.
--   * `corporate_actions` records each split. Once *applied*, every reader
--     multiplies a quantity booked before the effective session by the ratio.
--     `split_factor()` is that rule in SQL; `splitFactorAfter` is the same
--     rule in @powerfund/domain.
--   * `positions` is a projection, so applying a split re-projects it:
--     quantity is recomputed from the ledger on the new basis and average cost
--     is restated so quantity x avg_cost — the money actually paid — does not
--     move. No transaction is written, no cash moves, nothing is realised.
--
-- A split is registered `pending` and does nothing until a human applies it.
-- Detection is automatic (ingest opens a pending row when a vendor reports a
-- split or re-bases a series); application is not, for the reason the APH
-- incident already taught: an automatic repair path with a weak trigger is
-- more dangerous than no repair path. A pending split on a held name makes the
-- valuation provisional, which is the honest state until someone has checked.
--
-- Idempotency is structural rather than procedural. `pending -> applied` is a
-- one-way transition a row can make once; settled rows are immutable; and a
-- partial unique index stops the same event being registered twice. Running
-- the application again is not "safe because we check" — there is no second
-- application to run.

create type public.corporate_action_type as enum ('split');

create type public.corporate_action_status as enum (
  'pending',
  'applied',
  'rejected'
);

create table public.corporate_actions (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references public.instruments (id) on delete restrict,
  action_type public.corporate_action_type not null default 'split',
  -- First session that trades on the new basis (the ex-date). A trade booked
  -- in an earlier session is on the old basis; one booked on this day is not.
  effective_date date not null,
  -- New shares per `split_denominator` old shares: 8-for-1 is 8 / 1, a
  -- 1-for-10 reverse split is 1 / 10.
  split_numerator integer not null,
  split_denominator integer not null,
  status public.corporate_action_status not null default 'pending',
  -- How it reached us. Only 'manual' is a human's statement; the other two are
  -- things ingest noticed and a human still has to confirm.
  source text not null,
  -- What was observed: the vendor event, or the stored-vs-fetched ratio.
  evidence jsonb not null default '{}'::jsonb,
  -- A reverse split can leave a fraction of a share the broker will not hold.
  -- Whether it kept the fraction or paid cash for it is a fact about the
  -- broker, so it is recorded rather than assumed. Cash in lieu is then booked
  -- as the sale it was — a real transaction, entered by the operator.
  fractional_treatment text,
  verified_by text,
  verification_notes text,
  applied_at timestamptz,
  rejected_at timestamptz,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  constraint corporate_actions_ratio_positive check (
    split_numerator > 0 and split_denominator > 0
  ),
  constraint corporate_actions_ratio_changes_something check (
    split_numerator <> split_denominator
  ),
  -- `split_factor` compares the New York calendar day of a booking with this
  -- date, while the application code first walks a weekend booking back to
  -- Friday. The two rules agree for every effective date that is a weekday,
  -- and a split cannot take effect on a day the market is shut.
  constraint corporate_actions_effective_on_weekday check (
    extract(isodow from effective_date) < 6
  ),
  constraint corporate_actions_source_known check (
    source in ('vendor_event', 'price_rebase', 'manual')
  ),
  constraint corporate_actions_evidence_object check (
    jsonb_typeof(evidence) = 'object'
  ),
  constraint corporate_actions_fractional_known check (
    fractional_treatment is null
    or fractional_treatment in ('retained', 'cash_in_lieu')
  ),
  constraint corporate_actions_settled_consistency check (
    (status = 'applied') = (applied_at is not null)
    and (status = 'rejected') = (rejected_at is not null)
  ),
  -- Applying is a statement that someone checked. Say who, and against what.
  constraint corporate_actions_applied_is_verified check (
    status <> 'applied'
    or (
      verified_by is not null and char_length(btrim(verified_by)) > 0
      and verification_notes is not null
      and char_length(btrim(verification_notes)) > 0
    )
  ),
  constraint corporate_actions_reverse_states_fraction check (
    status <> 'applied'
    or split_numerator > split_denominator
    or fractional_treatment is not null
  )
);

comment on table public.corporate_actions is
  'Stock splits. Registered pending, applied once by a human, immutable afterwards. Applied rows restate ledger quantities at read time (split_factor); transactions are never rewritten.';

-- One live row per event. A rejected row does not block registering the same
-- split again, because "that was not a split" can turn out to be wrong.
create unique index corporate_actions_one_per_event_idx
  on public.corporate_actions (instrument_id, action_type, effective_date)
  where status <> 'rejected';

create index corporate_actions_instrument_idx
  on public.corporate_actions (instrument_id, effective_date);

create index corporate_actions_status_idx
  on public.corporate_actions (status);

create trigger corporate_actions_set_updated_at
before update on public.corporate_actions
for each row execute function public.set_updated_at();

-- The New York calendar day a booking belongs to. `transactions.occurred_at`
-- is a booking time, and the system's rule everywhere is that the session is
-- the New York day the operator was in (`fillSessionDate`).
create or replace function public.trade_session(p_at timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (p_at at time zone 'America/New_York')::date;
$$;

-- What a quantity booked on `p_session` is multiplied by to reach the current
-- share basis: the product of every applied split effective after it.
-- Numerators and denominators are multiplied separately and divided once, so
-- a 3-for-2 followed by a 2-for-3 is exactly 1.
create or replace function public.split_factor(p_instrument uuid, p_session date)
returns numeric
language plpgsql
stable
set search_path = ''
as $$
declare
  v_numerator numeric := 1;
  v_denominator numeric := 1;
  v_row record;
begin
  for v_row in
    select split_numerator, split_denominator
    from public.corporate_actions
    where instrument_id = p_instrument
      and action_type = 'split'
      and status = 'applied'
      and effective_date > p_session
  loop
    v_numerator := v_numerator * v_row.split_numerator;
    v_denominator := v_denominator * v_row.split_denominator;
  end loop;
  return v_numerator / v_denominator;
end;
$$;

comment on function public.split_factor(uuid, date) is
  'Product of the applied split ratios effective after a session: what a quantity booked then is multiplied by to sit on the current share basis.';

-- A new row is always pending. Inserting one already applied would skip the
-- re-projection that applying performs, and leave `positions` disagreeing with
-- every reader that honours the split.
create or replace function public.corporate_actions_insert_pending()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'pending' then
    raise exception
      'a corporate action is registered pending and applied afterwards; it cannot be inserted as %',
      new.status;
  end if;
  new.applied_at := null;
  new.rejected_at := null;
  return new;
end;
$$;

create trigger corporate_actions_insert_pending
before insert on public.corporate_actions
for each row execute function public.corporate_actions_insert_pending();

-- Settles a pending action, and — when it is applied — re-projects the open
-- position onto the new share basis.
create or replace function public.corporate_actions_settle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_position public.positions;
  v_units numeric;
  v_basis numeric;
  v_late_sale timestamptz;
  v_symbol text;
  v_ratio text;
  v_task uuid;
  v_now timestamptz := timezone('utc', now());
begin
  if old.status <> 'pending' then
    raise exception
      'a % corporate action is immutable; register the inverse split to correct it',
      old.status;
  end if;

  if new.instrument_id <> old.instrument_id or new.action_type <> old.action_type then
    raise exception 'a corporate action cannot be moved to another instrument or type';
  end if;

  if new.status = 'pending' then
    -- Still being worked on: the ratio and date may be corrected freely.
    new.applied_at := null;
    new.rejected_at := null;
    return new;
  end if;

  if new.status = 'rejected' then
    new.rejected_at := timezone('utc', now());
    new.applied_at := null;
    return new;
  end if;

  -- Applying.
  new.applied_at := v_now;
  new.rejected_at := null;

  -- A sale booked on the new basis before the split was applied was checked,
  -- and had its realised P&L computed, against a position still on the old
  -- basis. That figure is on an immutable row and cannot be re-derived here,
  -- so refuse rather than re-project around a number known to be wrong.
  select min(occurred_at) into v_late_sale
  from public.transactions
  where instrument_id = new.instrument_id
    and kind = 'sell'
    and public.trade_session(occurred_at) >= new.effective_date;

  if v_late_sale is not null then
    raise exception
      'a sale was booked at % on or after the effective date % before this split was applied; its realised P&L was computed on a mixed share basis and needs a hand correction first',
      v_late_sale, new.effective_date;
  end if;

  -- Numbers we store are restated by the rule above. Prose is not, and must
  -- not be: a dossier version records what was believed at the prices of its
  -- day. So the split opens a review, already due, that says exactly which
  -- per-share figures a human or the agent has to restate in a *new* version.
  -- It runs for unheld names too — a watchlist entry zone is as stale as a
  -- held one. A review task can never create a transaction, so this
  -- authorises nothing.
  select symbol into v_symbol from public.instruments where id = new.instrument_id;
  v_ratio := new.split_numerator || '-for-' || new.split_denominator;

  insert into public.review_tasks (
    title, instructions, scope, priority, status, trigger,
    created_by, scheduled_for, not_before, became_due_at
  )
  values (
    'Restate ' || v_symbol || ' per-share research after the ' || v_ratio || ' split',
    v_symbol || ' split ' || v_ratio || ', effective ' || new.effective_date || '. '
      || 'Stored closes, the position''s quantity and average cost, and price thresholds on review triggers '
      || 'are already on the new share basis. Free text is not. Every per-share figure written before '
      || new.effective_date || ' is on the old basis and must not be compared with current prices as written: '
      || 'entry zones and do-not-chase levels, bear/base/bull value per share, price-based invalidation levels, '
      || 'EPS and other per-share estimates, and the window of any open planned action. '
      || 'Restate them in a new dossier version (never edit an old one), restate the position''s invalidation '
      || 'if it quotes a price, and re-word any open planned action that quotes one. '
      || 'This review authorises no trade and reactivates no deferred action.',
    'company', 'high', 'due',
    jsonb_build_object('type', 'scheduled', 'at', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    'system:corporate-action', v_now, v_now, v_now
  )
  returning id into v_task;

  insert into public.review_task_instruments (review_task_id, instrument_id)
  values (v_task, new.instrument_id);

  select * into v_position
  from public.positions
  where instrument_id = new.instrument_id and status = 'open'
  for update;

  if v_position.id is null then
    -- Not held. The row still matters: it restates this name's research
    -- thresholds, and any earlier closed position's history.
    return new;
  end if;

  -- Recompute from the ledger rather than multiplying what the projection
  -- holds: a buy booked after the effective date is already on the new basis
  -- and must not be scaled. This row is not yet 'applied', so its own ratio is
  -- layered on top of the splits that already are. Each entry is rounded to
  -- the 8 decimals the book stores, the same way `apply_transaction` and
  -- `verify_book_against_ledger` do, so the three can never disagree by dust.
  select sum(
    (case when t.kind = 'buy' then 1 else -1 end)
    * round(
        t.quantity
        * public.split_factor(t.instrument_id, public.trade_session(t.occurred_at))
        * (case
             when public.trade_session(t.occurred_at) < new.effective_date
               then new.split_numerator::numeric / new.split_denominator
             else 1
           end),
        8
      )
  )
  into v_units
  from public.transactions t
  where t.instrument_id = new.instrument_id
    and t.kind in ('buy', 'sell');

  if v_units is null or v_units <= 0 then
    raise exception
      'applying this split would leave % units of an open position; the ledger and the projection disagree',
      coalesce(v_units, 0);
  end if;

  -- The money paid does not change. Average cost is whatever makes that true.
  v_basis := v_position.quantity * v_position.avg_cost;

  update public.positions
     set quantity = v_units,
         avg_cost = v_basis / v_units
   where id = v_position.id;

  return new;
end;
$$;

create trigger corporate_actions_settle
before update on public.corporate_actions
for each row execute function public.corporate_actions_settle();

-- History is never removed. A pending row that was a mistake is rejected, so
-- the record shows it was looked at and why it was dropped.
create or replace function public.corporate_actions_no_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'corporate actions are never deleted; reject a pending one, or register the inverse of an applied one';
end;
$$;

create trigger corporate_actions_no_delete
before delete on public.corporate_actions
for each row execute function public.corporate_actions_no_delete();

-- The ledger projection, now aware that a trade can be dated before a split
-- that has already been applied. A fill that really happened on the old basis
-- is booked as it happened and projected onto the current one, so the position
-- stays the sum the readers compute. For every trade booked after its splits —
-- which is all of them in the ordinary course — the factor is 1 and this is
-- the function it replaced, line for line.
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
  v_units numeric;
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

    -- Units on the current share basis. `new.quantity` itself is left exactly
    -- as booked.
    v_units := round(
      new.quantity
      * public.split_factor(new.instrument_id, public.trade_session(new.occurred_at)),
      8
    );
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
        new.instrument_id, 'open', 'long', v_units,
        v_cost / v_units, new.occurred_at, new.notes
      );
    else
      v_new_quantity := v_position.quantity + v_units;
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

    if v_units > v_position.quantity then
      raise exception 'cannot sell % units; only % held',
        v_units, v_position.quantity;
    end if;

    -- Average cost pooling: avg_cost is unchanged by a sale. A full exit removes
    -- the entire remaining basis so the ledger sums to exactly zero.
    if v_units = v_position.quantity then
      v_basis_out := v_position.quantity * v_position.avg_cost;
    else
      v_basis_out := v_units * v_position.avg_cost;
    end if;

    new.basis_delta := -v_basis_out;
    new.realized_pnl := new.cash_delta - v_basis_out;

    v_new_quantity := v_position.quantity - v_units;

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

-- The reconciliation, on the current share basis. Before this it summed raw
-- ledger quantities, which is the right answer only for a name that has never
-- split; left alone it would report the corrected position as the mismatch.
-- Cash and basis are dollars and are unchanged.
create or replace function public.verify_book_against_ledger()
returns table (check_name text, expected numeric, actual numeric, ok boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with ledger as (
    select
      t.instrument_id,
      sum(
        (case when t.kind = 'buy' then 1 else -1 end)
        * round(
            t.quantity
            * public.split_factor(t.instrument_id, public.trade_session(t.occurred_at)),
            8
          )
      ) as quantity,
      sum(t.basis_delta) as basis
    from public.transactions t
    where t.kind in ('buy', 'sell')
    group by t.instrument_id
  )
  select
    'cash' as check_name,
    coalesce((select sum(cash_delta) from public.transactions), 0) as expected,
    coalesce((select cash from public.portfolio_state limit 1), 0) as actual,
    coalesce((select sum(cash_delta) from public.transactions), 0)
      = coalesce((select cash from public.portfolio_state limit 1), 0) as ok

  union all

  select
    'quantity:' || i.symbol,
    coalesce(l.quantity, 0),
    coalesce(p.quantity, 0),
    coalesce(l.quantity, 0) = coalesce(p.quantity, 0)
  from ledger l
  join public.instruments i on i.id = l.instrument_id
  left join public.positions p
    on p.instrument_id = l.instrument_id and p.status = 'open'

  union all

  select
    'basis:' || i.symbol,
    round(coalesce(l.basis, 0), 2),
    round(coalesce(p.quantity * p.avg_cost, 0), 2),
    round(coalesce(l.basis, 0), 2) = round(coalesce(p.quantity * p.avg_cost, 0), 2)
  from ledger l
  join public.instruments i on i.id = l.instrument_id
  left join public.positions p
    on p.instrument_id = l.instrument_id and p.status = 'open';
$$;

-- The guards on this table are as load-bearing as the ledger's: a disabled
-- settle trigger would let a split be applied without re-projecting, or
-- applied twice. `verify:book` reads this and fails on any that is off.
create or replace function public.ledger_guard_status()
returns table (
  table_name text,
  trigger_name text,
  enabled boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.relname::text,
    t.tgname::text,
    -- 'O' fires on origin (the normal case), 'A' always. 'D' is disabled and
    -- 'R' fires only under replication, which for these guards is the same as
    -- off for every request the application makes.
    t.tgenabled in ('O', 'A')
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and not t.tgisinternal
    and c.relname in (
      'transactions',
      'decision_outcomes',
      'watchlist_membership',
      'corporate_actions'
    )
  order by c.relname, t.tgname;
$$;

alter table public.corporate_actions enable row level security;

-- A split is a public fact about a company, so viewers may read it — it is
-- research context, not the book. Whether we *hold* the name is not in here.
create policy "authenticated read corporate_actions"
  on public.corporate_actions for select to authenticated using (true);

create policy "operator insert corporate_actions"
  on public.corporate_actions for insert to authenticated
  with check ((select public.is_operator()));

create policy "operator update corporate_actions"
  on public.corporate_actions for update to authenticated
  using ((select public.is_operator()))
  with check ((select public.is_operator()));

-- No delete policy, and the trigger refuses it for the service role too.
grant select, insert, update on public.corporate_actions to authenticated;
grant select, insert, update on public.corporate_actions to service_role;
revoke all privileges on public.corporate_actions from anon;

-- PostgreSQL grants EXECUTE on a new function to PUBLIC, and PostgREST serves
-- every executable function in `public` as an RPC. The definer function here
-- is a trigger function and cannot be called directly, but the rule in
-- `function_access.sql` has no exceptions and should not acquire one.
revoke execute on function public.corporate_actions_settle() from public, anon, authenticated;
revoke execute on function public.corporate_actions_insert_pending() from public, anon, authenticated;
revoke execute on function public.corporate_actions_no_delete() from public, anon, authenticated;

-- Read-only helpers the trigger and the reconciliation call. They reveal
-- nothing but a public ratio, and RLS on `corporate_actions` still applies to
-- a caller that is not the owner.
revoke execute on function public.split_factor(uuid, date) from public, anon;
grant execute on function public.split_factor(uuid, date) to authenticated, service_role;
revoke execute on function public.trade_session(timestamptz) from public, anon;
grant execute on function public.trade_session(timestamptz) to authenticated, service_role;
