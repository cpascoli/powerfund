# MCP server: open items after the launch reviews (30 September 2026)

PR #1 (MCP server, OAuth, plugin) went through three reviews: the Portfolio
Manager's twice, plus an independent code review. Everything they raised is
fixed, except the items below, which were deliberately left for a later
change. Each says what the risk is, why it was deferred, and the shape of the
fix.

## 1. Uncertain MCP writes become re-runnable after an hour

**Finding (Portfolio Manager, 30 Sep).** An MCP idempotency reservation whose
outcome is unknown (the attempt threw, returned 5xx, or its process died) is
pinned as `IDEMPOTENCY_OUTCOME_UNKNOWN`. But once `MCP_KEY_WINDOW_MS` (one
hour) has passed since the first attempt, an identical call takes the
reservation over and runs again (`reserveIdempotency`, the `abandoned` takeover
in `apps/web/src/lib/api/agent/idempotency.ts`). If the first attempt had
committed before dying, that duplicates the write. The review's position:
only *completed* MCP reservations should expire; unknown ones should stay
pinned until reconciled, with explicitly new intent required to write again.

**Why it is not a one-line fix.** MCP keys are derived from the tool and its
exact arguments, so a key pinned forever blocks that identical write forever,
including a legitimate repeat such as next week's `hold` on VRT with the same
thesis text. The model has no way to say "this is new intent". The one-hour
rule is that tradeoff: nothing is re-run inside the window where retries
actually happen, and after it the same arguments count as a new decision, as
they already do for completed keys.

**Risk today.** It needs the rare case (a process dying after commit and
before recording), then the model resending the identical write more than an
hour later, having been told the outcome was unknown and to read back first.
The skill and runbook both say to read back. Only three operations can
actually duplicate: `createDecision`, `createPlannedAction`, and
`createReviewTask` (plus an off-clock grade). Every other write is naturally
safe to re-run.

**Fix, preferred.** Operation-level request keys, as `transactions.client_key`
does for fills: a nullable `request_key` column with a partial unique index on
`decisions`, `planned_actions`, `review_tasks`, and `decision_outcomes`
(off-clock rows). The agent API passes the idempotency key through, and a
duplicate insert fails in the database, where it can be mapped back to the
original row. The ambiguity then disappears rather than being refused on, so
unknown reservations can safely stay pinned and a genuinely new write can go
through. Needs a production migration. Test it on `supabase db reset` first.

**Fix, alternative.** Pin unknown MCP reservations indefinitely, and give each
write tool an optional `intent` nonce folded into the key, which the model
sets only after reading back and confirming the write is missing. Cheaper,
but it relies on the model using the nonce correctly.

## 2. `private_key_jwt` client authentication

Tokens are exchanged as a public client (`none`, with PKCE). ChatGPT's CIMD
document also supports `private_key_jwt`, which would prove the token request
came from ChatGPT itself: verify a signed assertion against
`https://chatgpt.com/oauth/jwks.json`. This is hardening, not a gap, for a
single-operator plugin.

## 3. No page to list or revoke MCP grants

Revocation is `/oauth/revoke` or SQL (runbook, "Operations"). An operator page
listing `oauth_tokens` by client, with last use and a revoke button, would
make this routine.

## 4. Rate limits are per function instance

`rateLimit` is in-memory, as it always was for the REST API. It guards against
a runaway loop, not a distributed attacker. Dynamic registration, the one
anonymous write path, is closed on every deployed site, so this is low
priority.

## 5. The REST agent API on a Deploy Preview can still write

MCP writes are impossible on previews by construction. The REST agent API on a
preview still accepts agent keys and writes, as it always has, to the shared
production database. No client uses preview REST URLs. If that changes, apply
`mcpWriteMode`'s rule to mutating agent routes too.

## 6. Output schemas are coarse

Every tool's `outputSchema` types top-level fields only, deliberately
permissive, because the SDK validates after a write has run. As the agent API
gains typed responses, tighten them field by field, keeping
`outputs.test.ts`'s "accepts an empty result and unknown fields" invariant.
