-- Rule 4 is checked on positions.invalidation. Fills write kill criteria onto
-- the enter/add decision; copy them onto the open position so Portfolio and
-- Briefing see the same text.

create or replace function public.copy_decision_invalidation_to_position()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.position_id is null then
    return new;
  end if;
  if new.decision_type not in ('enter', 'add') then
    return new;
  end if;
  if new.invalidation is null or btrim(new.invalidation) = '' then
    return new;
  end if;

  update public.positions
     set invalidation = btrim(new.invalidation)
   where id = new.position_id
     and status = 'open';

  return new;
end;
$$;

drop trigger if exists decisions_copy_invalidation_to_position on public.decisions;

create trigger decisions_copy_invalidation_to_position
after insert or update of position_id, invalidation, decision_type
on public.decisions
for each row
execute function public.copy_decision_invalidation_to_position();

update public.positions as p
   set invalidation = src.invalidation
  from (
    select distinct on (coalesce(d.position_id, open_pos.id))
           coalesce(d.position_id, open_pos.id) as position_id,
           btrim(d.invalidation) as invalidation
      from public.decisions d
      left join public.positions open_pos
        on open_pos.instrument_id = d.instrument_id
       and open_pos.status = 'open'
     where d.decision_type in ('enter', 'add')
       and d.invalidation is not null
       and btrim(d.invalidation) <> ''
       and coalesce(d.position_id, open_pos.id) is not null
     order by coalesce(d.position_id, open_pos.id), d.action_at desc
  ) as src
 where p.id = src.position_id
   and (p.invalidation is null or btrim(p.invalidation) = '');
