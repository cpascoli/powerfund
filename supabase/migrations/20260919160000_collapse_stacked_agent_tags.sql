-- Collapse the agent tags that stacked on planned-action rationales.
--
-- `withActor` prepended `[agent:<name>]` on every PATCH carrying an actor, and a
-- PATCH that changed anything else still re-ran it over the stored rationale --
-- which already had a tag. Three live rows carry two, one of them from two
-- different agents. Nothing is lost by collapsing them: prepending puts the most
-- recent writer first, so every tag after the first is a strictly older stamp on
-- text that has since been rewritten.
--
-- The code no longer stacks (it strips before it stamps), so this is a one-off
-- cleanup rather than a recurring repair. Idempotent: the pattern requires two
-- adjacent leading tags, so a row with one is left alone and a second run
-- changes nothing.

update public.planned_actions
set rationale = regexp_replace(
  rationale,
  '^(\[agent:[^\]]+\]\s*)(?:\[agent:[^\]]+\]\s*)+',
  '\1'
)
where rationale ~ '^\[agent:[^\]]+\]\s*\[agent:[^\]]+\]';
