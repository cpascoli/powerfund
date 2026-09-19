-- The BWXT planned action names the wrong agent.
--
-- 20260919160000 collapsed stacked `[agent:…]` tags by keeping the first, on the
-- reasoning that `withActor` prepends and so the first tag is the most recent
-- writer. That holds when every tag came from `withActor`. On this row one did
-- not: the stored text was
--
--   [agent:chatgpt]\n[agent:PowerFundAgent] Saturday 19 Sep calendar/process…
--
-- and the second tag is followed by a space rather than a newline, because it
-- was inline in the rationale the caller supplied rather than stamped by the
-- server. So the two tags had different origins and their order carried no
-- information about who wrote last. The operator confirms PowerFundAgent made
-- the 19 September deferral; the surviving attribution says chatgpt.
--
-- Only the tag changes. The body is PowerFundAgent's text either way and is left
-- exactly as it is.
--
-- Idempotent and narrow: matched on the row id together with the wrong prefix,
-- so a second run changes nothing and no other row can be caught by it.

update public.planned_actions
set rationale = '[agent:PowerFundAgent]' || substring(rationale from '^\[agent:chatgpt\](.*)$')
where id = '57f0ee3e-a570-4d1d-827f-8a4d202ac16c'
  and rationale like '[agent:chatgpt]' || chr(10) || 'Saturday 19 Sep calendar/process refresh%';
