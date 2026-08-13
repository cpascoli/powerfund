# ADR 0007: Transactions ledger as the source of truth for the book

## Status

Accepted

## Context

The book began as mutable state: `portfolio_state.cash` was a single number a form
could overwrite, and `positions` rows were edited in place. Booking a fill took
three separate statements — read cash, write the position, write cash — with no
transaction around them, so a failure between them left cash disagreeing with the
positions it paid for. There was no way to sell, no realized P&L, and no way to
answer "how did cash get to this number", which matters because real capital
($250k) is tracked here and a broker API (IBKR-style) is intended later.

Average cost is path dependent, so it cannot be recomputed from an unordered set
of rows; the order trades arrive in is part of the data.

## Decision

- `transactions` is append-only and is the only source of truth. `positions` and
  `portfolio_state.cash` are projections maintained by a `before insert` trigger
  in the same statement as the entry.
- History is never edited. `update` and `delete` raise, no RLS policy grants
  them, and corrections are posted as reversing or `adjustment` entries.
- `cash_delta` is authoritative and stored in whole cents. Cost basis is derived
  from cash moved, not from price × quantity, because fractional dollar-based
  fills debit an amount and compute the share count. Fees are therefore
  capitalised into basis automatically, which is the correct UK CGT treatment.
- `basis_delta` is stored per entry at full precision so cost basis is an exact
  sum over the ledger and a full exit zeroes to the cent.
- Sells use average cost pooling (UK Section 104): `avg_cost` is unchanged by a
  sale, and realized P&L is measured against the pooled cost.
- Back-dating a trade is refused rather than silently mis-averaging, since the
  projection is only correct when trades arrive in order.
- `verify_book_against_ledger()` reports drift between projections and ledger;
  `supabase/tests/ledger.sql` asserts the behaviour and is run via `pnpm db:test`.
- Idempotency for imports and retries comes from unique indexes on
  `(source, external_id)` and on `planned_action_id`.

## Consequences

- Atomicity and the concurrency race are solved by construction: one insert is
  one statement, and the trigger takes `for update` on the position row. No
  separate RPC layer is needed.
- Mandate enforcement, NAV snapshots and time-weighted return all become
  possible because deposits are now distinguishable from gains.
- Cash can no longer be typed in, so the cash editor was replaced by
  deposit/withdrawal/adjustment entries.
- Backfilling the pre-ledger book rounded cash from `244999.9412018` to
  `244999.94`, because a real account cannot hold a tenth of a cent.
- A broker import will need to post entries in chronological order, or rebuild
  the projection, because of the back-dating guard.
- The ledger cannot detect that PowerFund cash is a policy carve-out of a
  Coinbase account shared with the BTC/gold sleeve. That remains an operator
  discipline problem, recorded in the seed deposit's note.
