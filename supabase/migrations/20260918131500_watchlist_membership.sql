-- Point-in-time watchlist membership: what we were actually choosing from, on
-- the day we chose.
--
-- The 53-name universe every scorer replay has run against is the *surviving*
-- universe. Names we looked at and dropped are gone, so a replay can only ever
-- report how the names that lasted performed -- which is why the first replay
-- was unusable for tuning `fundamental_inflection_v1` and why the review
-- refuses to tune its thresholds against that sample. The fix is not more
-- tuning; it is recording the opportunity set as it changes, from now on.
--
-- This is the one item on the 18 September list that cannot be deferred without
-- loss. Every other finding can be fixed later at the same cost. Membership
-- history is perishable: nothing in the schema, the git log or the vendors can
-- tell us in March which names we were watching in September.
--
-- Shape: an append-only event log, not the `(added_at, removed_at)` interval
-- the review sketched. The two cannot coexist -- closing an interval means
-- UPDATEing `removed_at`, and an append-only table refuses UPDATE. So this
-- follows the pattern already proven here for point-in-time truth:
-- `fundamentals_vintages` is the append-only record and
-- `fundamentals_quarterly` is the projection. `watchlist_as_of()` below is the
-- projection, and intervals are derived rather than stored.

create type public.watchlist_event as enum ('added', 'removed');

-- How much to trust `occurred_at`. The 55 rows this migration seeds are dated
-- from `instruments.created_at`, which is when the row appeared rather than an
-- observation of a decision to watch the name; every row written after today is
-- observed as it happens. A replay that treats the two alike would be claiming
-- a precision the seeded rows do not have.
create type public.watchlist_event_source as enum ('observed', 'seeded');

create table public.watchlist_membership (
  id uuid primary key default gen_random_uuid(),
  -- `restrict`, not `cascade`: the point of this table is history that cannot be
  -- reconstructed, so deleting an instrument has to be a conscious decision to
  -- delete its membership record too.
  instrument_id uuid not null references public.instruments (id) on delete restrict,
  event public.watchlist_event not null,
  -- When the membership actually changed. `created_at` is when we wrote it down.
  occurred_at timestamptz not null default timezone('utc', now()),
  source public.watchlist_event_source not null default 'observed',
  reason text,
  actor_name text,
  -- `clock_timestamp()`, not `now()`, which is the convention elsewhere here.
  -- `now()` is the transaction timestamp and so is identical for every row
  -- written by one transaction, which would leave two events for the same
  -- instrument in a single transaction with no order between them and
  -- `watchlist_as_of()` picking arbitrarily. A wall-clock stamp advances within
  -- the transaction and breaks the tie. `occurred_at` stays transaction time,
  -- because that is when the membership changed.
  created_at timestamptz not null default timezone('utc', clock_timestamp())
);

create index watchlist_membership_instrument_idx
  on public.watchlist_membership (instrument_id, occurred_at desc);

create index watchlist_membership_occurred_at_idx
  on public.watchlist_membership (occurred_at desc);

create or replace function public.watchlist_membership_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'watchlist_membership is append-only; insert a new event instead of editing one';
end;
$$;

drop trigger if exists watchlist_membership_no_update on public.watchlist_membership;
create trigger watchlist_membership_no_update
before update on public.watchlist_membership
for each row execute function public.watchlist_membership_append_only();

drop trigger if exists watchlist_membership_no_delete on public.watchlist_membership;
create trigger watchlist_membership_no_delete
before delete on public.watchlist_membership
for each row execute function public.watchlist_membership_append_only();

---------------------------------------------------------------------------
-- Capture
---------------------------------------------------------------------------
-- In the database rather than the application. Instruments are written from the
-- web app, the agent API and the worker's seed path, and a rule that three
-- callers have to remember is a rule that one of them will not. A trigger
-- cannot be forgotten by a new caller.

create or replace function public.watchlist_membership_track()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'archived' then
      insert into public.watchlist_membership (instrument_id, event, reason)
      values (new.id, 'added', 'instrument created');
    end if;
    return new;
  end if;

  -- Only `archived` is a removal from the opportunity set.
  --
  -- This is the line that decides whether the table is worth having. Review item
  -- 8 will make `bookFill` move a held name from 'watchlist' to 'active', and
  -- treating that as a removal would write an exit for every name we bought --
  -- deleting precisely the names that worked from the record of what we were
  -- choosing from. That is the survivorship bias this table exists to remove,
  -- with the sign reversed, and it would look like data rather than a bug.
  -- Buying a name does not stop us having been watching it.
  if old.status <> 'archived' and new.status = 'archived' then
    insert into public.watchlist_membership (instrument_id, event, reason)
    values (new.id, 'removed', 'instrument archived');
  elsif old.status = 'archived' and new.status <> 'archived' then
    insert into public.watchlist_membership (instrument_id, event, reason)
    values (new.id, 'added', 'instrument un-archived');
  end if;

  return new;
end;
$$;

drop trigger if exists instruments_track_watchlist_insert on public.instruments;
create trigger instruments_track_watchlist_insert
after insert on public.instruments
for each row execute function public.watchlist_membership_track();

drop trigger if exists instruments_track_watchlist_status on public.instruments;
create trigger instruments_track_watchlist_status
after update of status on public.instruments
for each row execute function public.watchlist_membership_track();

---------------------------------------------------------------------------
-- Projection
---------------------------------------------------------------------------
-- The question a replay asks: which instruments were we watching on date D?
-- Answered from the latest event at or before D, so a name added, archived and
-- re-added reports correctly at every point in between.

create or replace function public.watchlist_as_of(as_of timestamptz)
returns table (
  instrument_id uuid,
  symbol text,
  added_at timestamptz,
  source public.watchlist_event_source
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    latest.instrument_id,
    i.symbol,
    latest.occurred_at as added_at,
    latest.source
  from (
    select distinct on (m.instrument_id)
      m.instrument_id,
      m.event,
      m.occurred_at,
      m.source
    from public.watchlist_membership m
    where m.occurred_at <= as_of
    order by m.instrument_id, m.occurred_at desc, m.created_at desc
  ) latest
  join public.instruments i on i.id = latest.instrument_id
  where latest.event = 'added'
  order by i.symbol;
$$;

---------------------------------------------------------------------------
-- Seed
---------------------------------------------------------------------------
-- One 'added' event per existing instrument, dated from `created_at` and marked
-- 'seeded' so no later analysis mistakes it for an observation. Idempotent:
-- re-running writes nothing, which matters because this file will be applied to
-- an empty database by CI and to production exactly once.

insert into public.watchlist_membership (instrument_id, event, occurred_at, source, reason)
select
  i.id,
  'added',
  i.created_at,
  'seeded',
  'seeded from instruments.created_at when point-in-time tracking began'
from public.instruments i
where i.status <> 'archived'
  and not exists (
    select 1 from public.watchlist_membership m where m.instrument_id = i.id
  );

---------------------------------------------------------------------------
-- Access
---------------------------------------------------------------------------
-- Research, not the book: which names we consider carries no dollar figure and
-- no unexecuted intention, so it sits on the viewer-readable side of the line
-- drawn in 20260903200000_viewer_read_surface.sql.

alter table public.watchlist_membership enable row level security;

create policy "authenticated read watchlist_membership"
  on public.watchlist_membership for select to authenticated using (true);
create policy "operator insert watchlist_membership"
  on public.watchlist_membership for insert to authenticated
  with check ((select public.is_operator()));

grant select, insert on public.watchlist_membership to authenticated, service_role;
revoke all privileges on public.watchlist_membership from anon;
revoke update, delete on public.watchlist_membership from authenticated;

grant execute on function public.watchlist_as_of(timestamptz)
  to authenticated, service_role;
