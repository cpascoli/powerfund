# PowerFund — working notes

Personal investment intelligence system managing real capital ($250k allocated,
~$27.5k invested) under a written mandate. Not a trading bot: a research →
decision → risk platform with a human confirming every fill.

**Read `docs/` before proposing anything about the investment process** —
`goals.md`, `mandate.md`, `themes.md`, `plan.md`, `gpt-agent-process.md`,
`agent-api.md`. They are living operator documents, not specs. Current open
items live in `docs/reviews/` — the **2026-09-18 full review** (§6.3 bug
table, §10 ordered next work) is the live list; the 2026-09-02 review and
2026-09-03 remediation log are its closure record. Read those before proposing
work, so you do not rediscover something already recorded.

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
pnpm --filter @powerfund/worker bars:freshness       # does the store reach the last session?
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
| `supabase test db` | Always exits non-zero. The suites `raise exception` rather than emit TAP, so the harness reports "No plan found" even when every one passes. CI is right to run them through `psql -v ON_ERROR_STOP=1` instead; do the same locally. |
| `market_bars.ingested_at` | `default now()` fires on INSERT only. An upsert that *updates* a row keeps the old timestamp, so it cannot tell you when a row was last written. Compare values against the vendor, not timestamps. |

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
- **A vendor changing prices for days we already stored is *maybe* a split.**
  Ingest compares before writing, but only overwrites history when the
  disagreement is consistent across two or more sessions (`looksLikeSplit`) and
  the refetched series has no discontinuity of its own. A single odd session is a
  vendor glitch: acting on one in September 2026 overwrote five years of correct
  APH prices. An automatic repair path with a weak trigger is more dangerous than
  no repair path.
- **A green ingest run is not evidence the store is current.** The vendor decides
  where its window ends, and twice in September 2026 Yahoo ended it at the
  *previous* session: every symbol logged "4 bars via yahoo", the snapshot keyed
  the day before, nothing failed, and the briefing quoted stale closes. Freshness
  is a property of the stored data (`bars:freshness`), never of the exit code.
- **Viewers read research, never the book.** `positions`, `portfolio_state`,
  `portfolio_snapshots`, `transactions`, `planned_actions` are operator-only.
  RLS refuses silently, so book-backed routes must say so rather than render a
  zeroed book.
- **Every write goes through `requireOperator()`** as well as RLS.
- **A planned action has a direction, and every risk rule is a rule about one
  side.** `mandateGate` takes a required `side`; a `sell` skips the caps and the
  kill-switch entirely and is gated only on holding the thing, because every one
  of those limits constrains *new* risk and a reduction lowers all of them. Use
  `isSellSide()` rather than comparing action types, and gate on the direction
  being asked for now, never the one on the stored row. The queue still cannot
  book a sale: `confirmPlannedAction` refuses `reduce`/`sell` outright rather
  than booking them through `bookFill` as it did before 2026-09-18 — sell from
  the position's own form until the confirm path routes by direction.
  Plan-time gating is an early warning, not the boundary: `restorePlannedAction`
  flips a status straight to `pending` with no gate, and `bookFill` is what
  actually stands between a planned action and the ledger.
- **A clocked grade is judged on evidence available at the horizon, not on
  evidence available when you got round to grading.** A 30-day grade written on
  day 33 must reconstruct what was knowable through day 30; later evidence
  belongs to the 90-day grade or an off-clock observation. `horizon_days` keeps
  the database honest, but only this keeps the judgement honest — the column
  cannot tell that a human read three extra days of tape. Same discipline as
  `fundamentals_as_of`, applied to conclusions rather than filings.
- **A grade names the horizon it is about.** `decision_outcomes.horizon_days` is
  30, 90 or 180, unique per decision, or null for an off-clock observation. Never
  infer the horizon from `recorded_at`: a grade written at day 100 is a judgement
  about day 100, and letting it stand for the 30- and 90-day rows writes hindsight
  into the record whose purpose is to exclude it. An off-clock row leaves the
  horizon owed. `horizon_due=true` on the agent journal is the grading worklist;
  `graded=false` answers the different question "never graded at all".
- **Watchlist membership is recorded as it changes, and only `archived` is a
  removal.** `watchlist_membership` is an append-only event log written by
  triggers on `instruments`; `watchlist_as_of(t)` is the projection. It exists
  because every scorer replay before it ran on the *surviving* universe. When
  `bookFill` starts moving held names to `active` (review item 8), that must not
  write a removal: it would erase exactly the names that worked from the record
  of what we were choosing from — the same survivorship bias, sign reversed, and
  indistinguishable from data. `occurred_at` is when membership changed;
  `created_at` uses `clock_timestamp()` so two events in one transaction stay
  ordered. Seeded rows carry `source = 'seeded'` because they are dated from
  `instruments.created_at`, which is a lower bound, not an observation.
- **A signal means "look at this name".** Pipeline state (`stale`,
  `completeness`) belongs on the setup row or a run log, never in `signals`.
  296 of 351 live signals are `data_completeness` flips; do not add another
  cause that fires when nothing about the company changed.

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

- **Never push without asking.** Commit to the local branch freely — that is the
  working rhythm and does not need permission. Pushing is a separate decision and
  needs explicit confirmation each time, because a push to `main` is a production
  deploy (Netlify builds from it) and it is what makes the work public. Do not
  read approval of the *work* as approval to push it. Ask, then push.
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
