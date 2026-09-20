-- `instruments.status` finally means something.
--
-- The enum has had 'watchlist' | 'active' | 'archived' since day one. Nothing
-- ever wrote 'active', so all 55 instruments read 'watchlist' including the
-- eight that are owned, and 'archived' was only ever read as an exclusion with
-- no way to set it. Ritual 5 (watchlist hygiene) has no state to move things
-- into, and Explore cannot tell a name we hold from a name we are watching.
--
-- Driven by a trigger on `positions` rather than from the booking actions,
-- because `positions` is itself a projection that `apply_transaction` maintains:
-- a fill never writes the row directly, so application code would be reacting to
-- something the database already did, and any future path that moves a position
-- would have to remember to do the same. The projection should follow its source
-- in the same statement.
--
-- 'archived' is never touched here. It is an operator judgement about whether a
-- name is worth watching at all, and owning something has no bearing on it --
-- an archived name that somehow holds a position should stay archived and
-- visibly wrong, rather than being quietly un-archived by a fill.

create or replace function public.sync_instrument_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_instrument uuid := coalesce(new.instrument_id, old.instrument_id);
  v_open int;
  v_next public.instrument_status;
begin
  select count(*) into v_open
  from public.positions p
  where p.instrument_id = v_instrument and p.status = 'open';

  v_next := case when v_open > 0 then 'active' else 'watchlist' end;

  -- The `<> v_next` clause keeps this a no-op when nothing changes, so a fill
  -- that adds to an already-open position does not touch the row -- which keeps
  -- `updated_at` meaning "the instrument changed" rather than "we traded it".
  update public.instruments i
  set status = v_next
  where i.id = v_instrument
    and i.status <> 'archived'
    and i.status <> v_next;

  return null;
end;
$$;

drop trigger if exists positions_sync_instrument_status on public.positions;
create trigger positions_sync_instrument_status
after insert or update of status or delete on public.positions
for each row execute function public.sync_instrument_status();

-- Backfill: the eight owned names have been mislabelled since August.
update public.instruments i
set status = 'active'
where i.status = 'watchlist'
  and exists (
    select 1 from public.positions p
    where p.instrument_id = i.id and p.status = 'open'
  );
