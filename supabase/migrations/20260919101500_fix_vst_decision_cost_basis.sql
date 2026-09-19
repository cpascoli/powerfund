-- The VST enter decision quotes a cost basis that never happened.
--
-- The 28 Aug VST fill was first booked with a mis-keyed price and the ledger
-- values were corrected afterwards. `bookFill` writes the journal row's
-- sizing_rationale from the same figure it writes to the ledger, so the two
-- agree when a fill is booked once -- but the correction touched the ledger and
-- left the prose behind. The row still reads "Cost basis $5333.65." against a
-- fill of $3,000.00.
--
-- Checked across all eight buys: VST is the only decision whose stated cost
-- basis disagrees with its transaction. The other seven match to the cent, so
-- this is a one-off rather than a pattern, and a targeted correction is right
-- where a sweep would not be. `verify_book_against_ledger()` returns 17 of 17
-- ok against production, so the money was never wrong -- only the sentence.
--
-- It matters because calibration reads it. VST is the largest loser in the first
-- 30-day entry cohort (-9.8% vs SPY), and grading its *sizing* against $5,333.65
-- would score a 1.2%-of-NAV starter as an oversized position and draw a lesson
-- about position sizing that the book does not support.
--
-- The new value is derived from the transaction rather than typed in, because
-- the ledger is authoritative over the journal everywhere else in this system
-- and there is no reason for this one row to be the exception.
--
-- Idempotent: the predicate matches only the stale text, so re-running changes
-- nothing. It matches no row on a fresh database, which is what CI applies this
-- to. This migration is itself the audit trail for the correction.

update public.decisions d
set sizing_rationale =
  'Cost basis $'
  || to_char(t.quantity * t.price + coalesce(t.fees, 0), 'FM9999999990.00')
  || '.'
from public.transactions t
where t.decision_id = d.id
  and t.kind = 'buy'
  and d.sizing_rationale = 'Cost basis $5333.65.';
