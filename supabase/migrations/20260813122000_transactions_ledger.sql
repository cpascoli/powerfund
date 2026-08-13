-- Transactions ledger — review findings BOOK-1, BOOK-3, BOOK-4, BOOK-5, D-3.
--
-- Before this, cash was a single mutable number that `saveCash` could overwrite
-- and `bookFill` decremented in a separate un-transacted statement, there was no
-- way to sell, and no way to reconstruct how cash reached its current value.
--
-- Model:
--   * `transactions` is append-only and is the single source of truth.
--   * `positions` and `portfolio_state.cash` are projections maintained by a
--     trigger, so they can never drift from the ledger, and any future broker
--     import gets the same maintenance for free.
--   * Corrections are made by posting a reversing or adjustment entry, never by
--     editing history.
--
-- Conventions:
--   * `cash_delta` is authoritative and signed, in whole cents. For a fractional
--     dollar-based buy the broker debits a cash amount and computes the share
--     count, so cost basis is derived from cash out rather than price × qty.
--   * Fees are capitalised into cost basis (correct for UK CGT), which happens
--     naturally because `cash_delta` already includes them.
--   * Average cost pooling (UK Section 104): a sell leaves `avg_cost` unchanged
--     and removes basis proportionally.
--   * `basis_delta` keeps full precision so cost basis is an exact sum over the
--     ledger and a full exit zeroes out to the cent.

create type public.transaction_kind as enum (
  'deposit',
  'withdrawal',
  'buy',
  'sell',
  'dividend',
  'interest',
  'fee',
  'adjustment'
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null,
  kind public.transaction_kind not null,
  instrument_id uuid references public.instruments (id) on delete restrict,
  quantity numeric(20, 8),
  price numeric(20, 8),
  fees numeric(20, 2) not null default 0,
  -- Signed cash effect, authoritative, in cents.
  cash_delta numeric(20, 2) not null,
  -- Signed cost-basis effect. Set by the trigger; full precision on purpose.
  basis_delta numeric,
  realized_pnl numeric,
  currency text not null default 'USD',
  notes text,
  decision_id uuid references public.decisions (id) on delete set null,
  planned_action_id uuid references public.planned_actions (id) on delete set null,
  source text not null default 'manual',
  external_id text,
  -- Populated when a mandate rule was knowingly breached (review BOOK-6).
  mandate_override_reason text,
  created_at timestamptz not null default timezone('utc', now()),

  constraint transactions_fees_non_negative check (fees >= 0),

  constraint transactions_trade_shape check (
    case
      when kind in ('buy', 'sell') then
        instrument_id is not null
        and quantity is not null and quantity > 0
        and price is not null and price >= 0
      else quantity is null and price is null
    end
  ),

  constraint transactions_instrument_scope check (
    kind in ('buy', 'sell', 'dividend') or instrument_id is null
  ),

  constraint transactions_cash_sign check (
    case kind
      when 'deposit' then cash_delta > 0
      when 'withdrawal' then cash_delta < 0
      when 'buy' then cash_delta < 0
      when 'sell' then cash_delta > 0
      when 'dividend' then cash_delta > 0
      when 'interest' then cash_delta > 0
      when 'fee' then cash_delta < 0
      when 'adjustment' then cash_delta <> 0
    end
  ),

  constraint transactions_realized_only_on_sell check (
    realized_pnl is null or kind = 'sell'
  )
);

create index transactions_occurred_at_idx
  on public.transactions (occurred_at desc);

create index transactions_instrument_occurred_at_idx
  on public.transactions (instrument_id, occurred_at)
  where instrument_id is not null;

-- Idempotent broker import: the same external fill can only land once.
create unique index transactions_source_external_id_idx
  on public.transactions (source, external_id)
  where external_id is not null;

-- Constraints the app already assumed but the schema did not enforce (D-5, BOOK-4).
create unique index positions_one_open_per_instrument_idx
  on public.positions (instrument_id)
  where status = 'open';

alter table public.positions add constraint positions_closed_at_consistent check (
  (status = 'open' and closed_at is null)
  or (status = 'closed' and closed_at is not null)
);

-- Append-only: history is never edited, only extended.
create or replace function public.transactions_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'transactions are append-only; post a reversing or adjustment entry instead';
end;
$$;

create trigger transactions_no_update
before update on public.transactions
for each row execute function public.transactions_append_only();

create trigger transactions_no_delete
before delete on public.transactions
for each row execute function public.transactions_append_only();

-- Projects a new ledger entry onto `portfolio_state.cash` and `positions`.
-- BEFORE INSERT so it can also fill in `basis_delta` and `realized_pnl`.
create or replace function public.apply_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_position public.positions;
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

  update public.portfolio_state
     set cash = cash + new.cash_delta;

  if not found then
    insert into public.portfolio_state (cash) values (new.cash_delta);
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

create trigger transactions_apply
before insert on public.transactions
for each row execute function public.apply_transaction();

-- Reconciliation: the projections must always equal the ledger. Used by tests
-- and worth running after any broker import.
create or replace function public.verify_book_against_ledger()
returns table (check_name text, expected numeric, actual numeric, ok boolean)
language sql
stable
security definer
set search_path = ''
as $$
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
  from (
    select
      instrument_id,
      sum(case when kind = 'buy' then quantity else -quantity end) as quantity,
      sum(basis_delta) as basis
    from public.transactions
    where kind in ('buy', 'sell')
    group by instrument_id
  ) l
  join public.instruments i on i.id = l.instrument_id
  left join public.positions p
    on p.instrument_id = l.instrument_id and p.status = 'open'

  union all

  select
    'basis:' || i.symbol,
    round(coalesce(l.basis, 0), 2),
    round(coalesce(p.quantity * p.avg_cost, 0), 2),
    round(coalesce(l.basis, 0), 2) = round(coalesce(p.quantity * p.avg_cost, 0), 2)
  from (
    select
      instrument_id,
      sum(case when kind = 'buy' then quantity else -quantity end) as quantity,
      sum(basis_delta) as basis
    from public.transactions
    where kind in ('buy', 'sell')
    group by instrument_id
  ) l
  join public.instruments i on i.id = l.instrument_id
  left join public.positions p
    on p.instrument_id = l.instrument_id and p.status = 'open';
$$;

alter table public.transactions enable row level security;

create policy "authenticated read transactions"
  on public.transactions for select to authenticated using (true);

-- Insert only. No update or delete policy exists, by design.
create policy "operator insert transactions"
  on public.transactions for insert to authenticated
  with check ((select public.is_operator()));

grant select, insert on public.transactions to authenticated;
grant select, insert on public.transactions to service_role;
revoke all privileges on public.transactions from anon;

-- Backfill existing history. The projection already holds these values, so the
-- trigger is disabled while the ledger catches up, then the projection is
-- reconciled to the ledger.
alter table public.transactions disable trigger transactions_apply;

insert into public.transactions (
  occurred_at, kind, cash_delta, basis_delta, notes, source
)
values (
  '2026-08-12 15:00:00+00',
  'deposit',
  250000.00,
  null,
  'PowerFund seed capital allocation. Held at Coinbase alongside a separate '
  || 'BTC/gold sleeve that is out of scope for this book, so this is a policy '
  || 'carve-out of a shared account rather than an isolated balance.',
  'backfill'
);

insert into public.transactions (
  occurred_at, kind, instrument_id, quantity, price, cash_delta, basis_delta,
  decision_id, notes, source
)
select
  '2026-08-12 15:28:00+00',
  'buy',
  i.id,
  16.86133,
  296.54,
  -5000.06,
  5000.06,
  (select id from public.decisions order by action_at limit 1),
  'Backfilled from the pre-ledger position record. Cash out is rounded to the '
  || 'cent; check the broker statement and post an adjustment if it differed.',
  'backfill'
from public.instruments i
where i.symbol = 'VRT';

alter table public.transactions enable trigger transactions_apply;

update public.portfolio_state
   set cash = (select sum(cash_delta) from public.transactions);

update public.positions p
   set quantity = l.quantity,
       avg_cost = l.basis / l.quantity
from (
  select
    instrument_id,
    sum(case when kind = 'buy' then quantity else -quantity end) as quantity,
    sum(basis_delta) as basis
  from public.transactions
  where kind in ('buy', 'sell')
  group by instrument_id
) l
where p.instrument_id = l.instrument_id
  and p.status = 'open';
