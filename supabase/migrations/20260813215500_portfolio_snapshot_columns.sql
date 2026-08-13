-- Nightly NAV snapshots (BOOK-7). Adds the cost/market breakdown the
-- deployed-capital kill-switch needs (mandate rule 8), and one-row-per-day
-- idempotency so the scheduled job can re-run safely.

alter table public.portfolio_snapshots
  add column invested numeric not null default 0 check (invested >= 0),
  add column positions_value numeric not null default 0 check (positions_value >= 0),
  add column snapshot_date date generated always as ((as_of at time zone 'utc')::date) stored;

create unique index portfolio_snapshots_snapshot_date_key
  on public.portfolio_snapshots (snapshot_date);
