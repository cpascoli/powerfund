-- Review BOOK-2: confirming a queued buy booked the fill and then updated the
-- queue in a second statement. If the update failed, or the operator retried a
-- slow submit, the same intent could be booked twice.
--
-- A planned action can now only ever have one ledger entry, enforced by the
-- database rather than by the order of statements in the server action.

create unique index transactions_planned_action_id_idx
  on public.transactions (planned_action_id)
  where planned_action_id is not null;
