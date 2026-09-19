-- Report whether the append-only guards are actually armed.
--
-- The ledger is the authority this whole system rests on. `positions` and
-- `portfolio_state` are projections the `transactions_apply` trigger maintains,
-- `verify_book_against_ledger()` checks the projection against the ledger rather
-- than the other way round, and the NAV series, the mandate gate and now
-- calibration sizing all read down from it. All of that assumes a booked
-- transaction cannot be rewritten, which `transactions_no_update` and
-- `transactions_no_delete` are what enforce.
--
-- In September 2026 a mis-keyed VST fill was corrected directly in the database,
-- which those triggers should have refused. Whatever allowed it, the guards'
-- live state became an open question -- and it is a question that cannot be
-- answered by trying: the only probe is an UPDATE against a real ledger row,
-- which mutates the book if the answer is "not armed". Asking the catalogue
-- costs nothing and is safe to run against production.
--
-- Read-only and side-effect free. `security invoker` because pg_catalog is
-- world-readable and this needs no elevation to answer.

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
      'watchlist_membership'
    )
  order by c.relname, t.tgname;
$$;

comment on function public.ledger_guard_status() is
  'Append-only and projection triggers on the ledger and the append-only journals, with whether each is currently enabled. Read-only; safe against production.';

grant execute on function public.ledger_guard_status() to authenticated, service_role;
