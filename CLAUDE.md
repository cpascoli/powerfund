# PowerFund — working notes

Personal investment intelligence system managing real capital ($250k allocated,
~$27.5k invested) under a written mandate. Not a trading bot: a research →
decision → risk platform with a human confirming every fill.

**Read `docs/` before proposing anything about the investment process** —
`goals.md`, `mandate.md`, `themes.md`, `plan.md`, `gpt-agent-process.md`,
`agent-api.md`. They are living operator documents, not specs. Current open
items live in `docs/reviews/` (the 2026-09-02 full review and the 2026-09-03
remediation log); read those before proposing work, so you do not rediscover
something already recorded.

## The rule that matters most

**Software phases and capital phases are two different ladders that share
numbers.** Always say "software Phase N" or "capital Phase N". Shipping a
feature never authorises deploying more money. Capital is currently Phase 1:
$75k invested-cost cap, ~$10k/month baseline. `$150k` and `$225k` are proposals,
not live gates.

## Layout

```
apps/web         Next.js app + public /api/v1 + private /api/v1/agent
apps/worker      ingest (bars, fundamentals), snapshot, scorer, replay
packages/domain  all pure logic — money, mandate, performance, vintages, scoring
packages/db      generated Supabase types
packages/data-clients  Yahoo / SEC / Tiingo / Stooq
supabase/        migrations, seed.sql, tests/*.sql
```

**Pure logic belongs in `packages/domain`.** Tests only run in `apps/web`
(vitest), so anything not reachable from there is untested in practice. When you
find yourself writing logic inside a worker script, extract it.

## Commands

```bash
pnpm typecheck                  # all five workspaces
pnpm test                       # vitest, apps/web only
pnpm db:test                    # SQL suites — needs the local stack running
supabase db start && supabase db reset   # apply all migrations + seed locally
supabase db push                # apply to production
pnpm db:types                   # generates from --linked (remote!) — see gotchas

pnpm ingest:bars -- --days=7 --symbols=NVDA
pnpm ingest:fundamentals -- --pauseMs=800
pnpm --filter @powerfund/worker snapshot:portfolio   # rebuilds NAV history
pnpm --filter @powerfund/worker snapshot:verify      # dry run, writes nothing
pnpm --filter @powerfund/worker score:replay -- --from=2021-06-21 --every=21
pnpm --filter @powerfund/worker bars:audit           # find split-shaped jumps
```

## Working with production

`apps/web/.env.local` holds the **production** Supabase URL and service-role
key. `set -a && . ./apps/web/.env.local && set +a` then query PostgREST for
read-only audits — that is how most findings in the reviews were established.

- **Never print the service-role key.**
- **Prefer a migration over an ad-hoc write.** Bulk `DELETE`/`INSERT` against
  production is blocked by the sandbox, correctly. If a data change is needed,
  write a migration, test it on a local reset, `db push`. If a one-off statement
  is genuinely right, hand it to the operator to run.
- **Production is the authoritative schema.** If migration history drifts,
  reconcile toward production (`supabase migration repair`), and prefer letting
  an idempotent migration run over marking it applied — running it removes the
  guess.
- Test every migration against `supabase db reset` before `db push`. This has
  caught real problems.

## Gotchas that cost time

| | |
|---|---|
| `pnpm db:test` | Needs Docker + `supabase db start`. Silently useless otherwise. |
| `pnpm db:types` | Runs `--linked`, i.e. **remote**. When testing an unpushed migration use `supabase gen types typescript --local > packages/db/src/database.types.ts`. |
| `seed.sql` | A dollar-quoted body starting with `$` (`$$$5–6B`) breaks the CLI's seed batcher though Postgres parses it fine. Use a tag. This silently broke `db reset` for weeks. |
| `safeupdate` | PostgREST's role rejects `UPDATE`/`DELETE` without `WHERE`. No function in `public` may contain one — `ledger.sql` asserts this. A test run as `postgres` proves SQL logic, not that the app can execute it. |
| Service role | Bypasses RLS. The public and agent APIs use `createAdminClient()`, so RLS changes never affect them — but also never protect them. |
| `apps/worker` `AdminDb` | Untyped `SupabaseClient`; results need casting. Do not assume generated types apply there. |
| `yahoo-finance2` v4 | `new YahooFinance()`, not a default instance. |
| One-off `tsx` scripts | Must live inside a workspace to resolve `@powerfund/*`, and cannot use top-level await. |
| PostgREST | Caps responses at 1,000 rows. Page with `.range()`. |

## Invariants — do not regress these

Each was a real production defect. See the remediation log for the full story.

- **Sessions, not wall-clock.** NAV snapshots are keyed on the US cash session
  (`lastCompletedCashSession`), stamped at that session's evening, and marked
  only from bars dated that session. SPY's bars are the trading calendar.
- **`transactions.occurred_at` is a booking time, not an exchange timestamp.**
  `fillSessionDate` is the New York calendar day of the booking. Flows and marks
  must agree on the session or you fabricate a return.
- **Fundamentals are point-in-time.** `fundamentals_vintages` is append-only,
  one observation per filing; `fundamentals_quarterly` is a projection.
  A scorer or backtest must read `fundamentals_as_of`, never the projection.
- **The book is USD and there is no FX layer.** A non-USD listing cannot be
  booked (`bookCurrencyBlock` plus a trigger). The currency a company *reports*
  in differs from the one it *trades* in — store both, never divide across them.
- **A vendor changing prices for days we already stored is a split.** Ingest
  compares before writing and refetches the full history on disagreement.
- **Viewers read research, never the book.** `positions`, `portfolio_state`,
  `portfolio_snapshots`, `transactions`, `planned_actions` are operator-only.
  RLS refuses silently, so book-backed routes must say so rather than render a
  zeroed book.
- **Every write goes through `requireOperator()`** as well as RLS.

## Testing philosophy learned here

199 tests passed while production published a max drawdown that never happened.
The fixtures verified *the maths given well-formed inputs*; nothing verified the
inputs were well-formed.

**Write invariant tests over stored data**, not just unit tests over functions:
a snapshot's marks come from its own session; a vintage is dated by the filing
that disclosed it; a viewer sees nothing while the operator still sees rows;
the stored series still agrees with the vendor. Where an assertion could pass
hollow, assert the negative too (a total lockout would satisfy "viewer sees
nothing").

## Conventions

- **Commits:** one focused change, subject a full sentence saying what and why,
  body explaining the reasoning and evidence. Look at recent history for tone.
- **Comments:** explain why, especially where a naive reading looks wrong.
- **CI** (`.github/workflows/ci.yml`) runs typecheck, tests, the web build, and
  a job applying every migration to an empty database. Netlify deploys from
  `main` on push, so a push is a deploy.
- Scheduled ingest is **GitHub Actions**, not Netlify (ADR 0006). It runs late
  routinely — never assume the cron fired on time.

## Current judgement calls

- **`fundamental_inflection_v1` stays shadow.** A five-year replay shows its
  "buy now" state underperforming the universe by 6.4% at twelve months while
  "already extended" and "already fallen" beat it. Do not wire it into Briefing
  or the buy gate, and do not tune its thresholds against that sample — the
  universe is survivorship-contaminated and tuning would fit noise.
- **Five names cannot be scored yet** (TSM, CCJ, NBIS, IREN, SKHY): SEC has no
  quarterly XBRL for them and Yahoo caps at 5 quarters for every symbol. They
  accumulate into scoreability via the vintage table; each carries a `dataGap`
  saying what it waits for. Do not lower `minQuartersForYoy` to clear them.
