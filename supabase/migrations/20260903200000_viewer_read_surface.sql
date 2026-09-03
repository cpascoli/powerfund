-- Viewers may see the research, not the money.
--
-- `app_users` gave us a role dimension in August and the write side was gated on
-- `is_operator()` then. The read side never was: every table stayed
-- `for select to authenticated using (true)`. Two viewer accounts have existed
-- since 14–15 August, which means they could read the exact cash balance, every
-- fill and its cost basis, and — the one that matters most — `planned_actions`,
-- the buys that have not happened yet. A live feed of intended trades is
-- front-running material, and `mandate.md`'s compliance note already says
-- publishing signals for others is a separate question from running the book.
--
-- The line drawn here is the one the August review proposed: weights, themes and
-- research text are shareable; dollar amounts, the ledger and the deployment
-- queue are not. Nothing is lost to a viewer that the public catalog does not
-- already publish in percentage terms.
--
-- The public API and the agent API read through the service role, which bypasses
-- RLS, so neither is affected.

do $$
declare
  tbl text;
  -- Anything from which a dollar figure or an unexecuted intention can be read.
  operator_only text[] := array[
    'positions',
    'portfolio_state',
    'portfolio_snapshots',
    'transactions',
    'planned_actions'
  ];
begin
  foreach tbl in array operator_only loop
    execute format(
      'drop policy if exists %I on public.%I',
      'authenticated read ' || tbl, tbl
    );
    execute format(
      'drop policy if exists %I on public.%I',
      'operator read ' || tbl, tbl
    );
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.is_operator()))',
      'operator read ' || tbl, tbl
    );
  end loop;
end;
$$;
