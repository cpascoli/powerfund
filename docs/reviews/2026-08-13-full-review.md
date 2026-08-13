# Power Fund — Full Project Review

**Date:** 2026-08-13
**Reviewed at commit:** `96f9ae6` (clean tree)
**Scope:** intent and goals → mandate → architecture → data model → delivery plan → implemented features
**Method:** read all of `docs/`, `architecture/`, `supabase/`, `apps/web/src`, `apps/worker/src`, `packages/*`, `netlify/`; ran `pnpm typecheck`; inspected the **live** hosted Supabase project (`vctpghpvtyabbogquuim`) for RLS policies, accounts, and data volumes.

---

## 1. Operator context (confirmed 2026-08-13)

These answers change what counts as a bug versus a deliberate trade-off, so they are recorded here.

| Question | Answer |
|---|---|
| Real capital in the system? | **Yes** — `/portfolio` reflects actual positions |
| Deployed site reachable? | **Yes** — `powerfund.netlify.app` is live and wired to the real hosted database |
| Strongest driver next 3 months | **Edge** — find candidates earlier than consensus |
| Mandate rule enforcement | **Hard block** with explicit override + written reason |
| Time budget | **15+ hrs/week** — main project |
| Fills / cash entry | Manual now, **broker API (IBKR-style) eventually** |
| Multi-user | **Single operator** for the foreseeable future — lock the door, don't build tenancy yet |

**Live state measured on the hosted project:**

| Metric | Value |
|---|---|
| Auth accounts | 1 (`carlo.pascoli@gmail.com`) — no unauthorized signups |
| Open positions | 1 |
| Cash | 244,999.94 |
| Decisions | 1 |
| Planned actions | 0 |
| Instruments | 46 |
| Market bars | 22,275 (latest `2026-08-12` — ingest is working) |
| Fundamentals rows | 1,171 |
| Signals | **0** |
| Portfolio snapshots | **0** |

---

## 2. Verdict

The **thinking** in this project is well above the median for a personal investing system. `goals.md`, `mandate.md`, and `themes.md` are genuinely good: they define an edge hypothesis, hard risk caps, and an anti-hype filter *before* the software. The ADR habit and the docs/architecture separation are the right instincts. `typecheck` passes clean across all five workspaces.

Three things are seriously wrong, in this order:

1. **Security (P0).** The live site with your real book has open email signup, and every RLS policy on the hosted database is literally `using (true) with check (true)` for the `authenticated` role. Anyone on the internet who signs up gets full read/write on your positions, cash, dossiers, and journal. Nobody has done it yet — you are the only account — but the door is open today. Additionally, table-level `SELECT` is granted to `anon` on every table (RLS currently blocks it, so this is a latent second failure, not an active one).

2. **The book is not transaction-safe (P0/P1).** Booking a fill is three separate un-transacted statements, there is no sell/exit path at all, cash is a single mutable number with no ledger, and nothing ever writes `portfolio_snapshots`. Consequence: you cannot compute realized P&L, cannot reconstruct NAV history, cannot compute a drawdown, and therefore cannot implement the kill-switch or measure a track record. For a system whose stated purpose includes proving edge, this is a foundational hole, not a polish item.

3. **Nothing in the system builds edge yet (P1, and it's your #1 goal).** You have ingestion and a browser. You have no normalization layer, no features, no scorers, no filings/events data, no backtest harness, and — critically — **no point-in-time data model**. `fundamentals_quarterly` is keyed `(instrument_id, period_end)` with no filing date, so a restatement silently overwrites history and you can never answer "what did I know on date X". Any scorer you build on this schema will be look-ahead biased and any backtest of it will be unfalsifiable. Fixing the vintage problem is cheap now and expensive after you've built scorers on top of it.

Below that: no tests, no CI, no working linter, and the docs have drifted from the code in several places.

---

## 3. Layer-by-layer

### 3.1 Intent and goals — strong, with one unmeasured claim

`docs/goals.md` is clear and the non-goals are as useful as the goals. Two gaps:

- **G-1 — "measurable process quality" is not measurable.** Goals promise "fewer late chase entries; documented invalidations; post-mortems". Nothing in the schema or UI measures any of those. `decisions.outcome_grade` exists but nothing prompts a review, and there is no "thesis due for review" surface despite `ux.md` specifying one on the Briefing strip.
- **G-2 — no performance measurement at all.** There is no time-weighted return, no benchmark comparison, no realized P&L, no deposit/withdrawal model. "Evidence that the process can generalize" and "track record" cannot be produced by the current system even in principle. Since cash is overwritten manually, a deposit and a trading gain are indistinguishable after the fact.

### 3.2 Mandate — good rules, three unresolved ambiguities

- **M-1 — Rule 1 never resolved.** The mandate says "cap % of NAV **at cost and/or at market** (define one primary rule and stick to it)" and then never defines it. The code silently chose *at market* (`portfolio.ts:358-359`). Pick one in the doc.
- **M-2 — Drawdown kill-switch is undefined in practice.** "15% from peak" requires a peak-NAV series. `portfolio_snapshots` is empty and unwritten, so peak NAV does not exist. `RISK_DEFAULTS.drawdownKillSwitchPct` has zero references in `apps/web/src`.
- **M-3 — The AI memory/storage 15% sleeve is unimplementable as written.** There is no way to tag an instrument as memory/storage; the sleeve cannot be computed. `maxAiMemorySleevePctNav` is also unreferenced.
- **M-4 — Business constants live in three places.** `$250,000` is hardcoded in `supabase/migrations/20260812214221_portfolio_state.sql:31-41` *and* `supabase/seed.sql:396-406`; `$75,000` lives only in `packages/domain/src/risk.ts`. The mandate doc is the fourth copy. One source of truth (`@powerfund/domain`, seeded from it) would be better.

### 3.3 Architecture — sound shape, honest ADRs, stale status

The component boundaries (`web` / `worker` / `domain` / `db` / `data-clients`) are right-sized, and the free-tier vendor decision (ADR 0005) plus the scheduled→background Netlify split (ADR 0006) are pragmatic and well reasoned. Issues:

- **A-1 — `architecture/overview.md` is materially out of date.** It says "Web app: Shell + IA", "Worker: Stub implemented", "Postgres schema: Initial migration". Reality: 6 migrations, a working ingest pipeline, and 10 real routes. The doc understates the system by a full phase, which is the opposite of the usual drift but equally misleading.
- **A-2 — Missing ADR for the chart library.** `ux.md:84` explicitly says "document the pick in an ADR when we add it". `recharts@^3.10.1` is now a web dependency. ADR 0007 is owed.
- **A-3 — `pipelines.md` and `security.md` are still listed as "add when they become real".** Ingest is real (22k bars). Given the P0 security findings, `security.md` is overdue.
- **A-4 — No observability boundary anywhere in the design.** No ingest run table, no error reporting, no health surface. The architecture claims "boring reliability in ingestion and bookkeeping" as design goal #5; there is currently no mechanism by which you would learn that ingestion broke.

### 3.4 Data model — the point-in-time problem is the important one

`architecture/data-model.md` diverges from the SQL: it omits `market_bars`, `market_caps`, and `fundamentals_quarterly` entirely, omits the `dossier_status` enum, describes seed as "core themes only" (it seeds ~46 instruments, 17 dossiers, cash, and queue rows), and does not mention the `anon` grants.

More important than the drift:

- **D-1 (critical for your #1 goal) — no data vintages.** `fundamentals_quarterly` PK is `(instrument_id, period_end)` with no `filed_at`/`accepted_at`/`as_of` column. Upserts overwrite. A restated quarter destroys the original. You cannot reconstruct the information set available on any past date, so you cannot build a look-ahead-free scorer or a credible backtest. The fix is cheap today: add `filed_at date not null` and make the key `(instrument_id, period_end, filed_at)`, or add an append-only `fundamentals_vintages` table and keep the current table as a "latest known" view.
- **D-2 — `market_bars` mixes adjusted and unadjusted prices in one series.** Stooq sets `adjClose = close` (raw), while Tiingo and Yahoo return split/dividend-adjusted values. The nightly job refreshes only the last 7 days, so historical Stooq rows persist next to newer adjusted rows, and every read path prefers `adj_close ?? close`. The chart is labelled "Daily adjusted close". Any returns computation crossing a vendor boundary or a corporate action is wrong. There is also no re-adjustment on split events, so old adjusted rows go stale the moment a name splits.
- **D-3 — Cash is a mutable singleton, not a ledger.** `portfolio_state` is one row enforced by `unique index on ((true))`. `saveCash` overwrites the balance outright; `bookFill` decrements it. There is no `cash_ledger`, no link from a fill to its cash movement, no deposit/withdrawal/fee concept. Cash history is unreconstructable and unauditable.
- **D-4 — `portfolio_snapshots` is dead.** Table + RLS + index exist; nothing writes it. No NAV history → no drawdown, no TWR, no equity curve.
- **D-5 — Missing constraints the app already assumes.** No partial unique index enforcing one open position per instrument (`book-fill.ts` assumes it). `instruments (symbol, exchange)` is unique but `exchange` is nullable, so `(NVDA, NULL)` can duplicate. No CHECK tying `status='closed'` to `closed_at is not null`. No `positions (instrument_id, status)` index. No `documents (source, external_id)` unique for idempotent filings ingest.
- **D-6 — Unqualified `numeric` everywhere.** Correct choice over float, but no precision/scale, so app-side and DB-side rounding can disagree. Standardise on `numeric(20,2)` for USD and `numeric(20,8)` for quantities.
- **D-7 — `packages/db/src/database.types.ts` is hand-maintained.** No `db:types` script anywhere. It happens to be in sync today; that will not survive.

### 3.5 Delivery plan — status is optimistic in one specific way

`docs/plan.md` is well structured and the phase gates are sensible. The inaccuracy worth fixing:

- **P-1 — "Phase 2 — Started early (EOD bars + quarterly fundamentals ingest)" overstates progress.** Phase 2's own exit criterion is "at least one explainable automated scorer in production use that is not pure price technicals". Ingestion is the *input* to Phase 2, not a slice of it. The pipeline shape the plan itself specifies — `ingest → normalize → entity resolve → feature store → scorers → alerts → human review` — has exactly one of seven stages built. Calling it "started" makes the biggest remaining gap look smaller than it is.
- **P-2 — Phase 1 is closer to done than the checkboxes suggest, except for the two that matter.** `[ ] Signal inbox CRUD` and `[ ] Filings/earnings links on dossiers` are the two unchecked items, and they are precisely the two that feed edge. Everything checked is bookkeeping and browsing.
- **P-3 — Phase 1's exit criterion is not met and can't be self-assessed.** "Weekly investment process runs entirely through Power Fund tooling" — there is no weekly review ritual surface, no review queue, and item 7 of the 30-day list is unchecked.
- **P-4 — Phase 3 depends on artifacts Phase 1 didn't produce.** Every Phase 3 bullet (drawdown controls, exposure history, stress scenarios) needs NAV snapshots and a sell path. Those should be pulled forward into Phase 1 rather than discovered as blockers in Phase 3.

### 3.6 Implemented features — what actually exists

| Route | Real state |
|---|---|
| `/` Briefing | Real. NAV, cash % NAV, watchlist count, mandate warn flags, theme counts. Shows the max-position *constant* rather than your actual max position weight (`page.tsx:64-66`). |
| `/explore` | Real. Theme map + watchlist with dossier status. |
| `/explore/[symbol]` | Real and the best page. Price chart, return row, live Yahoo quote, stored fundamentals, dossier create/edit. |
| `/signals` | **Static stub.** No DB read or write. `signals` table has 0 rows. |
| `/workbench` | Real. Market-cap treemap sized by cap, coloured by period return, theme filter via query params. Loads the entire `market_bars` and `market_caps` tables with no limit. |
| `/portfolio` | Real and the most complex. NAV/cash/P&L, mandate flags, theme exposures, deployment queue (plan/defer/cancel/confirm), edit cash, add unplanned fill. |
| `/decisions`, `/decisions/new`, `/decisions/[id]` | Real CRUD. |
| `/login` | Real. Email/password **signup is open**. |
| `/themes` | Real but not in the sidebar nav — only reachable via Explore links. |

Mandate enforcement reality check:

| Rule | Constant exists | Displayed | **Enforced on write** |
|---|---|---|---|
| Max 10% position | yes | yes (warn) | **no** |
| Max 40% theme | yes | yes (warn) | **no** |
| Min 10% cash | yes | yes (warn) | **no** |
| $75k phase-1 cap | yes | yes (warn, at cost) | **no** |
| 15% drawdown kill-switch | yes | **no** | **no** |
| 15% memory sleeve | yes | **no** | **no** |
| No average-down w/o evidence | — | no | **no** |

You asked for hard blocking with an override. Today it is advisory only, and two of the seven rules are not even computed.

### 3.7 Engineering hygiene

- **H-1 — Zero tests.** No test file, no runner, no `vitest`/`jest` dependency anywhere. For money math (weighted average cost, NAV, returns, cash debits) with real capital and 15 hrs/week available, this is the cheapest available risk reduction.
- **H-2 — No CI.** No `.github/workflows`. `typecheck` and `build` are only ever run by hand. Netlify builds on push, so a broken `packages/*` change reaches production without a gate.
- **H-3 — Linting is not actually configured.** `packages/domain`, `packages/db`, `packages/data-clients`, and `apps/worker` all have `"lint": "echo \"no lint configured\""`. `apps/web` has `"lint": "next lint"` but no eslint dependency and no eslint config file. So `pnpm lint` lints nothing.
- **H-4 — The generated DB types are bypassed in the riskiest file.** `book-fill.ts:36-89` hand-writes ~55 lines of fake Supabase client interfaces via `supabase as unknown as { from: ... }`, in three separate shims. This is the single most financially sensitive function in the codebase and it has deliberately opted out of the type system that `packages/db` exists to provide. A schema change here fails at runtime, in production, mid-fill. Same pattern in `apps/worker/src/ingest/bars.ts:54-63` and `fundamentals.ts:36-45`.
- **H-5 — No `loading.tsx` or `error.tsx` anywhere.** Data-layer `throw`s land on the default Next error page. Every data page is `force-dynamic`.
- **H-6 — Service-role key is co-located with the web app.** `apps/web/.env.local` holds `SUPABASE_SERVICE_ROLE_KEY` because the worker's env loader reads that file (`apps/worker/src/env.ts:4-6`). It is not `NEXT_PUBLIC_*` so it is not client-bundled, but it does get loaded into the web server's process env for no reason. Give the worker its own env file. (The file is correctly gitignored and untracked — verified.)
- **H-7 — No zod/schema validation on any external payload.** Vendor JSON is type-asserted and written straight to the DB (`tiingo.ts:47`, `sec.ts:56,171`, `yahoo.ts:144-148`, `netlify/functions/ingest-bars-background.ts:18-20`).

---

## 4. Findings register

Severity: **P0** act now · **P1** this sprint · **P2** soon · **P3** backlog.

### Security & access

| ID | Sev | Where | Finding | Fix |
|---|---|---|---|---|
| SEC-1 | **P0** | hosted project `auth.email.enable_signup` | Open public signup on an internet-facing site whose database has no per-user isolation. Any stranger's account became a full operator. | Disable signup on the **hosted** project (Dashboard → Authentication → Sign In / Providers → Email → turn off "Allow new users to sign up"). Leave `supabase/config.toml` signup enabled for local dev, since the first local account is how you bootstrap an operator. |
| SEC-2 | **P0** | all migrations; verified live | Every policy is `to authenticated using (true) with check (true)`. No `auth.uid()` check exists anywhere in the repo. Auth is the only boundary; there is no second line of defence. | Short term (matches your "lock the door" choice): keep the global model but add `auth.uid() is not null` and an allowlist check. Medium term: add `user_id` to the six book tables. |
| SEC-3 | **P0** | `20260811212701_grant_public_table_privileges.sql:10,22-23`; duplicated at `20260811130000_init_schema.sql:224-227` | `grant select on all tables in schema public to anon`, plus `alter default privileges ... to anon` so every *future* table inherits it. Only RLS stands between the public anon key and your book. One `disable row level security`, one permissive `anon` policy, or one security-definer view exposes everything. | `revoke select on all tables in schema public from anon;` and `alter default privileges in schema public revoke select on tables from anon;` |
| SEC-4 | **P1** | `apps/web/src/lib/supabase/middleware.ts:15-18` | Auth **fails open**: if Supabase env vars are missing, `updateSession` returns `NextResponse.next()` and every route renders unauthenticated. A misconfigured deploy silently unlocks the app. | Fail closed — redirect to `/login` or return 503 when env is absent outside local dev. |
| SEC-5 | **P1** | `20260812081347_market_and_fundamentals.sql:54-70` | Any authenticated user can `update`/`delete` `market_bars`, `market_caps`, `fundamentals_quarterly`. Ingest data has no write protection. | Grant `select` to `authenticated`; restrict writes to `service_role` only. |
| SEC-6 | **P2** | server actions | No server action calls `getUser()`. All authorization is delegated to middleware + RLS. Defence in depth is absent. | Assert an authenticated user at the top of every mutating action. |
| SEC-7 | **P2** | hosted project advisors | Supabase linter: leaked-password protection disabled; `public.set_updated_at` has a mutable `search_path`. | Enable HaveIBeenPwned checks; `alter function public.set_updated_at() set search_path = ''`. |
| SEC-8 | **P3** | `apps/web/.env.local`, `apps/worker/src/env.ts:4-6` | Service-role key loaded into the web server process because the worker reads the web app's env file. | Separate worker env; keep the service-role key out of `apps/web`. |

### The book (correctness of money)

| ID | Sev | Where | Finding | Fix |
|---|---|---|---|---|
| BOOK-1 | **P0** | `apps/web/src/lib/actions/book-fill.ts:91-187` | Booking a fill is three un-transacted statements (read cash → write position → write cash). If the cash update fails, the position is already committed and the error message literally says "Position saved but cash was not updated". Your book silently desyncs. | Move the whole operation into one `book_fill` Postgres function with `select ... for update` on `portfolio_state`. |
| BOOK-2 | **P0** | `apps/web/src/lib/actions/planned-actions.ts:187-216` | `confirmPlannedAction` books the fill, *then* marks the queue row confirmed. If the status write fails, the row stays `pending` and a retry books the fill **again** — double shares, double cash debit. | Same transaction, or optimistic lock: `update planned_actions set status='confirmed' where id=$1 and status in ('pending','deferred') returning *` **before** booking, abort if 0 rows. |
| BOOK-3 | **P0** | schema + `apps/web` | **There is no sell, exit, or reduce path.** `decision_type` and `planned_action_type` include `reduce`/`exit`/`sell`, and `positions.status` has `closed`, but no code closes a position, reduces quantity, or credits cash. The book can only grow. Realized P&L is therefore impossible. | Implement `bookSell`/`bookReduce` with cash credit, realized P&L capture, and `closed_at`. |
| BOOK-4 | **P1** | `book-fill.ts:91-176` | Read-modify-write race on cash and on position quantity. Two concurrent requests both pass the solvency check. No DB constraint prevents two open positions in the same instrument. | Transaction + `for update`; add `create unique index positions_one_open_per_instrument_idx on positions (instrument_id) where status='open'`. |
| BOOK-5 | **P1** | `apps/web/src/lib/actions/cash.ts:18-76` | Cash can be overwritten to any value with no reconciliation against `sum(quantity*avg_cost)` and no record of *why*. This is also the de-facto deposit/withdrawal mechanism, which means performance and contributions are indistinguishable. | Introduce `cash_ledger` (signed amounts, `kind in ('deposit','withdrawal','fill','fee','adjustment')`, FK to position/planned action). Derive `portfolio_state.cash`. |
| BOOK-6 | **P1** | `packages/domain/src/risk.ts` + all actions | Mandate caps are display-only; no write is ever blocked. You asked for hard blocking. | Shared `assertMandateAllows(book, proposedFill)` called by `bookFill` and `savePlannedAction`; on violation, refuse unless an `override_reason` is supplied, and persist the override on the decision. |
| BOOK-7 | **P1** | `portfolio_snapshots` unwritten | No NAV history → no peak NAV → the 15% kill-switch cannot exist, and neither can an equity curve or TWR. | Nightly snapshot job (extend the Netlify scheduled function) writing `as_of`, `nav`, `cash`, `exposures`. |
| BOOK-8 | **P2** | `portfolio.ts:350,359,364` | Positions with no market data are marked **at cost** (`marketValue ?? costBasis`) with no visual distinction. Stale or failed ingest silently produces a plausible-looking NAV. | Mark unpriced positions explicitly; show as-of age per position; flag the book when any mark is stale. |
| BOOK-9 | **P2** | `portfolio.ts:223-224,353`; `book-fill.ts:157` | `side` is read but never used in valuation. A short would *add* to NAV. Nothing creates shorts today, so this is latent. | Sign market value by side, or CHECK-constrain `side='long'` until shorts are supported. |
| BOOK-10 | **P2** | `lib/data/planned-actions.ts:108-111` | Queue cash projection sums **all** action types as outflows; a `sell` row would reduce projected cash. | Filter to `buy`/`add`, or sign by type. |
| BOOK-11 | **P2** | `lib/data/planned-actions.ts:139-150` | Post-queue position weight is projected as `marketValue + plannedUsd`, mixing a mark with a dollar intent; it will not match the actual fill. | Project via `plannedUsd / lastPrice`, or label as approximate. |
| BOOK-12 | **P2** | `book-fill.ts:218-220` | If the journal insert fails, the fill still succeeds and you are never told — a position with no thesis, which is a mandate violation by construction. | Surface the error, or write both in one transaction. |
| BOOK-13 | **P3** | `book-fill.ts:33,106,180`; `portfolio.ts:219-221` | All money math in IEEE-754 doubles. The live cash balance is already `244999.9412018`. Cosmetic today, compounding later. | Round at persistence boundaries; standardise DB scale (D-6). |
| BOOK-14 | **P3** | `lib/actions/planned-actions.ts:117-118` | `deferPlannedAction`/`cancelPlannedAction` `throw` on DB error with no try/catch in the form action → raw Next error overlay. | Return an error result like the sibling actions. |
| BOOK-15 | **P3** | `book-fill.ts`, `planned-actions.ts`, `dossiers.ts`, `decisions.ts` | No validation that `instrument_id` exists; `saveDecision` updates by an arbitrary hidden-field id without verifying a row changed. | Validate FK existence; check affected row count. |

### Data & ingestion

| ID | Sev | Where | Finding | Fix |
|---|---|---|---|---|
| DATA-1 | **P0** for edge | `20260812081347_market_and_fundamentals.sql:28-42` | **No point-in-time vintages.** `fundamentals_quarterly` PK `(instrument_id, period_end)`, no `filed_at`. Upserts destroy restated history. Look-ahead bias is unavoidable and backtests are unfalsifiable. | Add `filed_at`; key on `(instrument_id, period_end, filed_at)` or add an append-only vintage table. Do this **before** writing any scorer. |
| DATA-2 | **P0** | `stooq.ts:77-78` vs `tiingo.ts:53-54`, `yahoo.ts:49-50`; `bars.ts:42-65` | **Adjusted and unadjusted closes mixed in one series.** Stooq writes `adj_close = close` (raw); Tiingo/Yahoo write true adjusted. The 7-day nightly refresh leaves old rows from a different vendor with different semantics. Every read prefers `adj_close`, and the chart claims "adjusted". Returns crossing a vendor or corporate-action boundary are wrong. | Add a `price_basis` column and never mix in a query; or stop persisting Stooq as adjusted (`adj_close = null`) and full-backfill on vendor change. Also: nothing re-adjusts history after a split. |
| DATA-3 | **P1** | `yahoo.ts:15-19,44-45,64-67` | Bar dates derived via `toISOString().slice(0,10)` — **UTC**. US session timestamps near midnight ET can land on the wrong calendar day, and `market_caps.as_of_date` has the same skew. | Format in `America/New_York`; add a test at the ET-close boundary. |
| DATA-4 | **P1** | `scheduled-ingest-bars.ts:36-40`; `ingest-bars-background.ts:11-14,28-35` | **Ingest failures are invisible.** The scheduled function never checks `res.ok`; the background function always returns `202` even when `ingestBars` throws or `result.failed` is non-empty; unauthorized calls also return `202`. You would never learn that ingestion broke. | Return 401/500/207 appropriately, check `res.ok`, log structured JSON, and persist runs. |
| DATA-5 | **P1** | worker + functions | No `ingest_runs` table, no per-symbol status, no staleness detection. `ingested_at` is not even refreshed on upsert. The UI says "No daily bars yet" but never "last bar is 6 days old". | Add `ingest_runs` + `instrument_ingest_status`; surface freshness on Briefing. |
| DATA-6 | **P1** | `packages/data-clients/src/index.ts:49-50` | First vendor returning **any** bars wins. A truncated or partial Tiingo window blocks the Yahoo/Stooq fallback. | Validate coverage (expected trading days, max date within tolerance) before accepting a vendor. |
| DATA-7 | **P1** | `sec.ts:100-106,136-137` | A 10-K tagged `fp: "Q4"` with a ~365-day duration passes the quarterly filter (`span > 300` is accepted; only `fp = "FY"` is dropped). **Annual revenue can be stored as a quarter.** | Exclude annual-duration facts from quarterly maps, or require `form = '10-Q'`. |
| DATA-8 | **P1** | `sec.ts:267-273` | `netDebt = (longDebt ?? 0) + (shortDebt ?? 0) - cash` treats a missing debt tag as zero, understating leverage. | Return `null` unless at least one debt tag exists; never zero-fill a missing leg. |
| DATA-9 | **P2** | `sec.ts:248-252,267-273` | Balance-sheet *instant* facts are joined to income-statement *duration* period-ends by exact string equality. XBRL instants often differ by a day or two → silent nulls or mismatched net debt / share counts. | Match on nearest end within N days, or on `fy`/`fp`. |
| DATA-10 | **P2** | `tiingo.ts:33-38`, `yahoo.ts:35-40`, `stooq.ts:24-29`, `sec.ts:35-41` | No retry or backoff anywhere. A transient 429/5xx drops that symbol for the day. | Shared fetch wrapper: retry on 429/502/503, honour `Retry-After`. |
| DATA-11 | **P2** | `netlify/functions/*`, `apps/worker/src/index.ts:39-40` | **Fundamentals never run in production** — CLI only. Only bars are scheduled. Your fundamentals go stale silently. | Add a weekly scheduled + background fundamentals function. |
| DATA-12 | **P2** | `apps/worker/src/ingest/fundamentals.ts:56-61` | Failures are logged and discarded; no `failed[]`, no non-zero exit. | Mirror `IngestBarsResult`; set `process.exitCode = 1`. |
| DATA-13 | **P2** | `sec.ts:3` | SEC `User-Agent` contact is `local-dev` — not a reachable address. SEC fair-access policy expects real contact info; they throttle or block otherwise. | Read a real contact from env. |
| DATA-14 | **P2** | `sec.ts:108-118` | Restatement preference barely weights `filed` date, so a restated quarter may lose to the original. Compounds DATA-1. | Prefer latest `filed` for the same `(end, fp)`; persist `filed`. |
| DATA-15 | **P2** | `sec.ts:286`, `yahoo.ts:185` | `currency` hardcoded `'USD'`; SEC reader only looks at `units.USD`. Wrong or silently empty for non-USD filers. | Read the actual unit key; reject mixed units. |
| DATA-16 | **P2** | `stooq.ts:22-23` | `.us` suffix hardcoded — non-US symbols return HTML or nothing. | Map from `instruments.exchange`, or disable Stooq for non-US. |
| DATA-17 | **P3** | `yahoo.ts:45` | On an unparseable date the row falls back to `args.startDate`, collapsing many bars onto one date and clobbering via upsert. | Skip the row and warn. |
| DATA-18 | **P3** | `lib/data/workbench.ts:54-60` | Loads the **entire** `market_bars` and `market_caps` tables with no limit or date window (22k rows today, growing daily). | Window server-side; `distinct on` for latest cap. |
| DATA-19 | **P3** | `lib/data/portfolio.ts:199-214`; `lib/data/research.ts:203-211` | N+1: one `market_bars` query per position; `getInstrumentDossier` loads the whole watchlist (4 table scans) to find one symbol. | `distinct on (instrument_id)` in one query; query `instruments` by symbol directly. |

### Product & process

| ID | Sev | Where | Finding | Fix |
|---|---|---|---|---|
| PROD-1 | **P1** | `/signals`, `signals` table (0 rows) | The signal inbox — the entire "why look now" surface, and the stated Phase 2 exit criterion — does not exist. | Build manual signal CRUD first; it's the write target for the first scorer. |
| PROD-2 | **P1** | nowhere | **No scorer, no feature layer, no filings/events data.** Your #1 goal has no implementation. | See §5. |
| PROD-3 | **P1** | nowhere | No review ritual: no "thesis due for review" queue, no invalidation-breach detection, no post-mortem prompt. `ux.md:55` specifies the Briefing strip should carry exactly this. | Add a review queue keyed off `decisions.reviewed_at` and dossier `next_diligence`. |
| PROD-4 | **P2** | `apps/web/src/app/page.tsx:64-66` | Briefing shows the max-position *constant*, not your actual largest position weight. Reads like a live metric; it isn't. | Show `max(weightPctNav)` against the cap. |
| PROD-5 | **P2** | `login-form.tsx:22-25` | Signup UI is exposed on a live single-operator site. | Remove the signup path from the UI once your account exists (and see SEC-1). |
| PROD-6 | **P3** | `/themes` | Real page, absent from the sidebar. | Nav it or fold into Explore. |
| PROD-7 | **P3** | `market-cap-treemap.tsx:158-172` | Treemap tiles are `<g onClick>` — mouse-only, no focus, role, or keyboard. | Use `<button>` or add keyboard handling. |
| PROD-8 | **P3** | no `loading.tsx`/`error.tsx` | Any data-layer throw hits the default Next error page with no recovery. | Add per-zone error and loading boundaries. |

### Hygiene

| ID | Sev | Where | Finding |
|---|---|---|---|
| HYG-1 | **P1** | repo | Zero tests. Money math, returns, SEC parsing, and mandate checks are all unverified. |
| HYG-2 | **P1** | repo | No CI. Netlify deploys on push with no typecheck/test gate. |
| HYG-3 | **P2** | all workspaces | `pnpm lint` lints nothing: 4 workspaces echo a stub, `apps/web` runs `next lint` with no eslint installed and no config. |
| HYG-4 | **P2** | `book-fill.ts:36-89`, `bars.ts:54-63`, `fundamentals.ts:36-45` | ~55 lines of hand-written fake Supabase interfaces via `as unknown as` in the most money-sensitive function in the repo, defeating `packages/db` entirely. |
| HYG-5 | **P2** | `packages/db` | `database.types.ts` maintained by hand; no generation script. |
| HYG-6 | **P2** | vendor clients + background function | No schema validation on any external JSON before it is written to the DB. |
| HYG-7 | **P3** | `supabase/seed.sql:105-111,382-393` | Seed `on conflict do update` overwrites operator-edited instruments and dossiers. Harmless locally, destructive if ever run against the live project. |
| HYG-8 | **P3** | docs | `architecture/overview.md`, `architecture/data-model.md`, `docs/plan.md` status table all drifted (see A-1, D-*, P-1). Missing ADR 0007 (recharts), `pipelines.md`, `security.md`. |

---

## 5. The strategic gap

You said **edge** is the strongest driver for the next three months. Measured against that, here is the honest scorecard of the seven-stage pipeline your own plan specifies:

```text
ingest → normalize → entity resolve → features → scorers → alerts → human review
  ~70%      0%            0%            0%         0%        0%         ~20%
```

`ingest` is real but has the semantic defects above (DATA-1, DATA-2). Everything between ingest and the journal is missing. The 30 days of work since the initial commit went almost entirely into bookkeeping and browsing surfaces — good surfaces, but they are the part of the system that makes you *organised*, not the part that makes you *early*.

Two structural prerequisites gate all edge work, and both are cheap now and expensive later:

1. **Point-in-time correctness (DATA-1, DATA-2).** Without vintages and consistent price semantics, every scorer you write will be look-ahead biased and every backtest of it will be unfalsifiable. You will not be able to tell a real signal from a bug. Fix this before the first scorer, not after.
2. **A measurement loop (BOOK-3, BOOK-5, BOOK-7).** Without realized P&L, a cash ledger, and NAV snapshots, you cannot answer "is this working" for either a scorer or your own process. Your goals doc asks for exactly that evidence.

A reasonable first scorer, given what you already ingest and what the mandate calls edge — improving CapEx/contracts/fundamentals while price and narrative lag — is the one already named in `plan.md`: **growth/CapEx inflection with an anti-parabolic filter**. You have quarterly revenue, FCF, capex, net debt, and two years of daily bars for 46 names. That is enough for a v1 that is explainable, testable, and directly mandate-aligned — *once* the vintage problem is fixed.

---

## 6. Recommended sequence

### Now (today, ~1 hour) — close the door

1. **SEC-1** Disable email signup on the hosted Supabase project.
2. **SEC-3** Revoke `anon` SELECT grants and the default privilege.
3. **SEC-4** Make middleware fail closed.
4. **SEC-5** Remove authenticated write policies from the three market tables.

### Sprint 1 — make the book trustworthy

5. **BOOK-1 + BOOK-2 + BOOK-4** One transactional `book_fill` RPC; idempotent queue confirmation; partial unique index on open positions.
6. **BOOK-3** Sell/reduce/close path with realized P&L.
7. **BOOK-5** `cash_ledger` with deposits/withdrawals/fees; derive the balance.
8. **BOOK-7** Nightly NAV snapshot → unlocks drawdown, the kill-switch, and an equity curve.
9. **BOOK-6** Hard mandate enforcement with a written override, per your choice.
10. **HYG-1 + HYG-2** Vitest on the money math and mandate checks; a GitHub Actions gate running typecheck + tests. Also **HYG-4** — delete the fake client shims while you are in `book-fill.ts`.

### Sprint 2 — make the data honest

11. **DATA-1** Fundamentals vintages (`filed_at`). Highest-leverage schema change in the project.
12. **DATA-2** Resolve adjusted vs raw; backfill; add `price_basis`.
13. **DATA-3** Exchange-local bar dates.
14. **DATA-4 + DATA-5** Ingest run records, real status codes, staleness surfaced on Briefing.
15. **DATA-7 + DATA-8 + DATA-9** SEC fiscal-period and net-debt correctness.
16. **DATA-11** Schedule fundamentals in production.

### Sprint 3 — build edge

17. **PROD-1** Signal inbox CRUD (manual first).
18. Filings/events ingest (`documents` table is already modelled and empty) + filings on dossiers — the last unchecked Phase 1 item.
19. A features/derived table (relative strength, drawdown from high, revenue/FCF growth, capex acceleration, distance-from-parabolic).
20. Backtest harness over vintage data, then the first scorer, writing into `signals` with a rationale.
21. **PROD-3** Weekly review ritual surface → closes the Phase 1 exit criterion.

### Ongoing

22. Doc refresh: `architecture/overview.md` status, `data-model.md` (market tables, `dossier_status`, grants), `plan.md` Phase 2 honesty, ADR 0007 for recharts, new `pipelines.md` and `security.md`.
23. **M-1/M-2/M-3** Resolve the mandate ambiguities: cost vs market for the position cap, define peak-NAV mechanics, decide how memory/storage names get tagged.

---

## 7. Open questions

1. **Cost or market** for the max-position rule (M-1)? The code currently assumes market.
2. **How should the memory/storage sleeve be identified** (M-3) — a secondary theme, an instrument tag, or a hand-maintained list?
3. **Deposits and withdrawals**: do you expect to add capital to the $250k over time? If yes, TWR needs a contribution series, which changes the `cash_ledger` design.
4. **Which broker** for the eventual API path? IBKR's model (Flex queries vs the Web API) would shape whether fills arrive as a statement import or a live sync, and therefore whether `positions` should become derived from a `transactions` table rather than mutated in place. This is worth deciding *before* Sprint 1, because a transactions-first design would also solve BOOK-3 and BOOK-5 in one move.
5. **Backtest ambition**: do you want a genuine event-driven backtester, or is cross-sectional factor evaluation (rank names by score, measure forward returns by decile) enough for year one? The latter is far cheaper and probably sufficient given "explainable signals over opaque models".
6. **Non-US names**: the mandate mentions liquid proxies and defence, which pulls toward European listings. Stooq, SEC, and the USD assumption are all US-only today (DATA-15, DATA-16).

---

## 8. Read-only viewers — design note (added 2026-08-13)

**Requirement:** share access with friends so they can track the book, without any ability to mutate it.

**Assessment: cheap to retrofit — this is the easiest multi-user shape available.** It needs a *role* dimension, not a *tenancy* dimension. Because the book is a single global book (D-3, SEC-2), no `user_id` column, no row ownership, and no data migration is required. The work is almost entirely in the 28 existing RLS policies, which the P0 security work is already rewriting. Doing it in the same pass costs close to nothing; doing it later means touching every policy twice.

### Shape

1. **`app_users` table** — `user_id` PK → `auth.users`, `role app_role not null default 'viewer'`. New accounts default to **viewer**, so an unexpected signup can read at worst, never write.
2. **`public.is_operator()`** — `stable security definer set search_path = ''`, wrapped as `(select public.is_operator())` in policies so Postgres evaluates it once per statement rather than per row.
3. **Policy split** — keep `for select to authenticated`; replace every `for all ... using (true) with check (true)` with an insert/update/delete policy gated on `(select public.is_operator())`.
4. **App layer** — a single `requireOperator()` chokepoint in the server actions, plus hiding mutation UI for viewers. Without this, a viewer clicking "Add fill" gets a raw Postgres RLS error instead of not seeing the button.

### Three traps

- **`SECURITY DEFINER` RPCs bypass RLS.** Directly relevant: the transactions-first `book_fill` RPC we just agreed on must be `security invoker`, or must call `is_operator()` itself. A definer-rights RPC would hand every viewer a working write path straight through the role check.
- **Self-settable roles are the classic escalation bug.** `app_users` must allow a user to *read* their own row and never to update `role`. No blanket write policy on that table.
- **Individual accounts, not a shared credential.** A single shared read-only login cannot be revoked per person and leaves no audit trail. Invite accounts individually with `role = 'viewer'`.

### The real question is not technical

What should a viewer actually see? Reads are currently `to authenticated using (true)`, so a viewer would get **everything**, including:

- exact cash balance and dollar position sizes,
- the decision journal with theses and invalidation levels,
- **`planned_actions` — your not-yet-executed buys.**

That last one is the one to think hardest about. A live feed of what you are about to buy is front-running material, and `docs/mandate.md`'s own compliance note says publishing signals for others requires separate legal work. Broadcasting intended trades to friends is closer to that line than showing them a historical book.

Suggested default: viewers see **percentage weights, theme exposure, and closed/realized history**, not dollar amounts and not the deployment queue. That is a data-layer change (compute from NAV, redact dollars) plus per-table read policies — worth doing deliberately rather than by accident.

### Sequencing

- **Today (P0 pass):** write side gated on `is_operator()`; `app_users` created; new accounts default to viewer. No viewers provisioned yet.
- **Before the first viewer:** decide the read surface per table, add operator-only read policies for whatever stays private, add `requireOperator()` in server actions, gate mutation UI on role.
- **Not needed:** per-user rows, `user_id` columns, tenancy. Those remain deferred per the operator's choice.

---

## 9. Remediation log

### 2026-08-13 — P0 access hardening (applied to the live project)

Migrations, applied to `vctpghpvtyabbogquuim` and checked in:

| Version | What |
|---|---|
| `20260813115117_operator_role_and_lockdown` | `app_role` enum, `app_users` table, `is_operator()`, signup trigger; all 14 `authenticated write <table>` policies replaced with 33 operator-gated insert/update/delete policies; market tables left with no authenticated write policy; `set_updated_at` search_path pinned |
| `20260813115237_revoke_anon_privileges` | All `anon` table, sequence, and routine privileges revoked, plus the default-privilege rules |
| `20260813120053_bootstrap_first_operator` | First account on an empty database becomes operator; all later accounts are viewers |

Code: `apps/web/src/lib/supabase/middleware.ts` now fails closed — returns 503 outside development when Supabase env vars are absent, instead of serving every route unauthenticated (SEC-4).

**Verified after applying:** `anon` holds 0 table privileges (was 90); 0 policies remain with `with_check = true`; RLS on all 15 tables; 1 operator, 0 viewers; `is_operator()` resolves true for the owner and false for an unknown uid; `authenticated` retains execute on `is_operator()`; `pnpm --filter @powerfund/web typecheck` clean.

**Correction to SEC-3.** The finding said `anon` held table-level `SELECT`, based on the repo migration. That understated it. `anon` actually held `SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER` on all 15 public tables — Supabase's default `grant all to anon`, which the repo's own `grant select ... to anon` was merely redundant with. Including `INSERT` on `app_users`, where a single row would have meant self-assigning the operator role. RLS blocked all of it (there are no `anon` policies), so nothing was ever exposed, but the blast radius of any future RLS mistake was total rather than read-only.

**Note for future migrations:** Supabase applies its own default privileges when new tables are created, so `anon` grants can reappear. Re-check `information_schema.role_table_grants` for `grantee = 'anon'` after adding tables, ideally as a CI assertion once CI exists (HYG-2).

### Still open from the P0 set

- **SEC-1 — disable email signup.** This is a dashboard setting and cannot be done from a migration. Until it is off, strangers can still create accounts; they now land as read-only viewers rather than operators, so the severity is reduced from "full control of the book" to "can read everything", but it is still open.
- **SEC-6 — `requireOperator()` in server actions.** RLS now rejects viewer writes, but the UI will surface a raw Postgres error rather than hiding the control. Needed before the first viewer account exists.
