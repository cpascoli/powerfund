# PowerFund — full review, 18 September 2026

Third full review. Same shape as [2026-09-02](./2026-09-02-full-review.md):
intent → capital → software → process → bugs → tests → what next. Reads the
[2026-09-03 remediation log](./2026-09-03-remediation-log.md) as the closure
record for the last review's P0/P1 items and does not re-argue them.

Measured against production on **18 Sep 2026, 09:56 Bangkok** (= 17 Sep
22:56 ET, after the 17 Sep cash close and before the 03:07 UTC ingest job).
Every number below is from PostgREST reads with the service role, from
`snapshot:verify` (dry run, writes nothing), or from the repo at `1790570`.
Typecheck clean; **315 Vitest tests in 49 files pass**.

---

## 1. Verdict

**The rituals are running and the measurement layer is now trustworthy. The
stock selection is not working yet, and two faults in the sell path mean the
system could not de-risk cleanly if the diagnostic ever concludes it should.**

Sixteen days after the last review, the things that review said were wrong with
*measurement* are fixed and have stayed fixed: 25 session-keyed snapshots, zero
alignment issues, zero stale sessions, every holding's newest bar on the same
date as SPY's. The kill-switch reads a true series. Three deployed-drawdown
diagnostics have been run and persisted as portfolio review tasks (30 Aug,
3 Sep, 17 Sep). The monthly pass and opportunity ranking happened on 1 Sep and
wrote outcomes. The weekly holding review covered all eight names on 15 Sep.
That is a functioning process, and it is more than most personal books have.

What the process is *reporting* is the uncomfortable part:

| Series (17 Sep diagnostic, 16 Sep closes) | Value |
|---|---|
| Unitized deployed sleeve since inception (12 Aug) | **−13.8%** |
| SPY / QQQ over the same window | −2.4% / −2.6% |
| Deployed-sleeve drawdown from peak (unitized) | **15.2%**, max **17.0%** |
| Deployed sleeve on cost | −10.1% ($24,734 on $27,500) |
| NAV | $247,233 (−1.1%; max NAV drawdown 1.4%) |
| Cash | 90.0% of NAV |

Eleven percentage points of underperformance against the benchmark in five
weeks on eight names is stock/factor selection, not timing of the market. The
diagnostics say so in their own words ("genuine stock/factor underperformance
rather than a benchmark-only correction"). The sleeve has been at or beyond the
15% line on three separate occasions in five weeks. The mandate's Phase-1
answer — diagnose, do not trim, keep deploying at baseline — is being followed.
§3.2 asks whether a 15% threshold on an eight-name, high-beta sleeve is an
*incident* or the *base rate*, because the answer changes what the ritual is
for.

### 1.1 Headline software finding — the queue cannot sell, and the gate would stop it if it could

Nothing has ever been sold. The 2 Sep review noted the sell path was
"unexercised in production". Reading it now, two faults sit in the only path an
agent-planned de-risk would take:

**(a) Confirming any queued action books a buy.** `confirmPlannedAction`
(`apps/web/src/lib/actions/planned-actions.ts`) loads
`id, instrument_id, status, rationale` — not `action_type` — and calls
`bookFill()` unconditionally. The queue renders a **Confirm** link for every
row regardless of type. A `reduce` or `sell` planned action confirmed from the
queue would insert a `buy` transaction, debit cash, and *increase* the position.
The `planned_action_id` unique index would then mark the sell as "confirmed".
Repairing it after the fact means a manual ledger reversal. The enum has had
`reduce` and `sell` since 13 Aug; the confirm flow has only ever known `buy`.

**(b) The mandate gate is direction-blind.** `createPlannedAction` and
`updatePlannedAction` run `mandateGate({ costUsd: planned_usd })` for every
action type, and `mandateGate` calls `evaluateProposedBuy`. A `sell` of $5,000
in a name is evaluated as a *purchase* of $5,000: it can fail the position cap,
the theme cap, the AI-capex cap, or — once the book is above the capital
Phase-1 cap — the kill-switch halt. The instrument designed to stop new risk in
a drawdown would also stop the agent from queuing the exit that the drawdown
diagnostic recommends. Today, with $27.5k invested, the halt is inert (it only
fires above $75k), so this has not bitten. It will be live exactly when it
matters.

Neither has caused a loss. Both are one bad afternoon away from one, and the
afternoon in question is the one where the diagnostic says "trim". Fix before
the next diagnostic, not after.

### 1.2 What the last review got right, and what it left

Of the 2 Sep P0/P1 items: snapshot alignment, currency guard, operator-only
writes, migration drift, DATA-1 vintaging, split handling — **closed** and
verified against production today (§4.3). Of its P1/P2 code items, **eight are
still open** and are carried in §6.3 with their original severity, three of
them upgraded because production evidence has since arrived.

---

## 2. Two roadmaps

Unchanged and worth restating because it is the rule that keeps the two
ladders apart: **software Phase N never authorises capital Phase N**. Capital is
Phase 1 ($75k invested-cost cap, ~$10k/month baseline). Software is Phase 1
with Phase 2 machinery built and Phase 3 minimum slice live. `$150k` and
`$225k` remain proposals.

The 17 Sep diagnostic recommends "maintain the deployment ladder; do not
accelerate". That is a capital decision recorded in a capital ritual. Good.

---

## 3. Capital roadmap

### 3.1 Live book (16 Sep 2026 close)

| Symbol | Qty | Avg cost | Opened | Cost | Instrument status | Dossier |
|---|---|---|---|---|---|---|
| VRT | 16.861 | 296.54 | 12 Aug | $5,000 | watchlist | investigate |
| CLS | 14.355 | 348.30 | 13 Aug | $5,000 | watchlist | investigate |
| NVT | 26.324 | 170.95 | 13 Aug | $4,500 | watchlist | investigate |
| MRCY | 22.891 | 109.21 | 13 Aug | $2,500 | watchlist | investigate |
| NBIS | 5.911 | 253.76 | 13 Aug | $1,500 | watchlist | investigate |
| VST | 21.420 | 140.05 | 28 Aug | $3,000 | watchlist | investigate |
| ISRG | 8.022 | 373.97 | 31 Aug | $3,000 | watchlist | investigate |
| CRDO | 17.664 | 169.84 | 2 Sep | $3,000 | watchlist | **active_thesis** |

Invested cost $27,500 = 36.7% of the Phase-1 cap. Cash $222,500. Ledger and
`portfolio_state.cash` agree to the cent. All eight positions carry a written
`invalidation` and `thesis_summary` (mandate rule 4). Only CRDO's dossier says
`active_thesis`; seven held names have dossiers in `investigate`, the same
state as 45 research stubs. The book's own research surface cannot tell an
owned name from a candidate.

### 3.2 The sleeve, the diagnostic, and what "15%" is measuring

The kill-switch reads `unitizedDeployedIndex` — a time-weighted unit series of
deployed capital — and compares drawdown from its peak against 15%. That is the
right series (the 2 Sep review's P0 was that it read a wrong one). Today it
says 15.2% down from a 17.0% max, on a sleeve whose on-cost P&L is −10.1%.

Three observations for the mandate, not the code:

1. **The sleeve crossed 15% three times in five weeks** (24 Aug region,
   3 Sep at 16.7%, 14–17 Sep at 15.2%). Each time the diagnostic classified it
   as "AI-infrastructure factor / valuation compression, not thesis failure",
   and each time the response was "hold, keep baseline deployment". Three
   identical outcomes is a pattern the ritual should be able to name. Either
   the classification is right and the threshold is too tight for an
   eight-name sleeve of names with 1.5–2× market beta (in which case 15%
   *absolute* is the base rate, not an incident, and the mandate should say
   what a relative-to-QQQ or volatility-scaled diagnostic would look like), or
   the classification is a comfortable story and −13.8% vs −2.4% is stock
   selection that deserves a harder question. The mandate should say which
   question the *fourth* diagnostic must answer differently.
2. **Two "drawdown" numbers are quoted in the same breath.** The diagnostic
   outcomes quote the unitized 15.2%; Portfolio → Book shows on-cost −10.1%.
   Both are correct and they differ by five points because fills at cost
   entered near the trough. Every ritual that quotes a drawdown should name the
   series. The 17 Sep outcome does ("unitized deployed drawdown ... 15.2%
   (max 17.0%)"); the 1 Sep monthly pass does not.
3. **The re-open rules are working.** 14 days after 3 Sep is 17 Sep, and the
   17 Sep diagnostic exists. `resolveDrawdownDiagnostic` (stale after 14 days,
   worsened by 5pp, new episode) is doing what the mandate text says.

### 3.3 Capital Phase-1 evidence scorecard

The mandate's Phase-1 → Phase-2 transition (ritual 13) needs evidence, not a
date. Where each proof stands after five weeks:

| Proof | Status | Evidence |
|---|---|---|
| Every fill through the queue with a written thesis and invalidation | **Met** | 8/8 positions have both; 6 of 8 fills came through confirmed planned actions; VRT and CLS (12–13 Aug) predate the queue |
| Weekly holding review persisted | **Met, cadence slipped once** | Holds on 30 Aug (8), 5 Sep (9), **15 Sep** (9). No review in the week of 8–12 Sep; the gap was 10 days |
| Monthly book pass + opportunity ranking | **Met** | 1 Sep, both persisted with outcomes; October tasks scheduled |
| Drawdown diagnostic when breached | **Met** | 30 Aug, 3 Sep, 17 Sep |
| Decision grades (`recordDecisionOutcome`) | **Not started** | **`decision_outcomes` has 0 rows.** 57 decisions, none graded. The "which decisions are ungraded" query shipped 15 Sep (`d68336a`) and has not been used |
| Sell path exercised | **Not met** | No `reduce`/`exit` decision, no sell transaction, and §1.1 says the path is broken |
| Track record vs benchmark | **Negative** | Sleeve −13.8% vs SPY −2.4% since 12 Aug |
| Catalyst calendar for held names | **Partial** | 12 pending tasks, all agent-created. Only MRCY has company tasks. **No Q3 earnings task exists for any held name** although ISRG (~21 Oct) and VRT (~22 Oct) report inside 35 days |

### 3.4 Deployment pace

$27,500 in 37 days is ~$22k/month against a $10k/month baseline — front-loaded
($18.5k in the first two days) and then $9k across 28 Aug – 2 Sep. Nothing has
been deployed since 2 Sep. The 1 Sep ranking said no candidate cleared the gate;
BWXT sits pending at $745 as a "tracking position only if it reclaims" stub.
At baseline the $75k cap is reached ~January 2027. The 17 Sep diagnostic said
"do not accelerate". Consistent.

### 3.5 The scorer is still a shadow, correctly

`fundamental_inflection_v1` remains off Briefing and off the buy gate. The
replay result ("buy now" underperforms by 6.4% at twelve months) stands. No
tuning has been done against the survivorship-contaminated sample. Good — and
§8 says what would make it evaluable.

---

## 4. Software roadmap

### 4.1 Phase 1 — Research OS

Shipped since 2 Sep (from `git log`): review history queryable with a
mandatory read-before-write gate; Briefing Research tab as a read-only agent
endpoint; ungraded-decision query; catalyst discovery as a measurable weekly
obligation; live NAV anchored to the stored close; ingest moved to 03:07 UTC
with a stale-gated 05:07 retry; split-signature guard on price repair; paging
of stored closes; CLI pinned in CI.

Still open from the plan: filings/earnings links on dossiers (the `documents`
table has **0 rows** and nothing writes it); signal inbox CRUD. The first
matters more than it looks — see §7.

### 4.2 Phase 2 and 3

Phase 2: the point-in-time machinery is built and the exit criterion is not
met. Phase 3: kill-switch encoded, diagnostics running, correlation/AI-capex
views live. The pre-capital gate is not a gate yet (§1.1b makes it the wrong
kind of gate for sells).

### 4.3 Closure of 2 Sep items — verified today

| Item | State | Evidence |
|---|---|---|
| Snapshot session alignment (P0) | **Closed, holding** | `snapshot:verify`: 25 sessions, `alignmentIssues: []`, `staleSessions: []`; all `as_of` at `22:30Z` of `snapshot_date` |
| SKHY currency (P1) | **Closed** | 55/55 instruments USD; SKHY now the Nasdaq ADR, bar $174.87 |
| Operator-only writes/reads | **Closed** | Not re-tested here; covered by RLS suites |
| Migration drift | **Closed** | Not re-tested |
| DATA-1 vintages | **Closed** | 2,385 vintage rows; 2,032 quarterly projection rows |
| APH split | **Closed** | APH $77.26, consistent with post-split basis |
| Macro scope undocumented (P2) | **Closed** | `gpt-agent-process.md` now defines macro tasks |
| `review_tasks.sql` not in `db:test` (P3) | **Closed** | `db:test` globs `supabase/tests/*.sql` |
| Benchmarks labelled TR, data is PR (P1) | **Open** | `label: "S&P 500 TR"` unchanged; every bar still `adj_close == close` |
| No holiday calendar (P1) | **Open, now with a measured cost** | Labor Day 7 Sep: 32 `data_completeness` signals at 01:55 UTC 8 Sep because `lastCompletedCashSession` said a session had happened |
| cancelled → pending ungated (P1) | **Open** | Code unchanged |
| `withActor` double prefix (P2) | **Open, worsened** | Live rows read `[agent:chatgpt] [agent:chatgpt]` (ISRG, MRCY) |
| Signals 65% noise (P2) | **Open, worse** | 351 rows; **296 `data_completeness`**, 256 `X → X` (73%) |
| `bookFill` unplanned-fill retry (P2) | **Open** | Unchanged |
| `listDecisions` unbounded (P2) | **Open** | No `.limit()`/`.range()`; 57 rows today |
| `instruments.status='active'` dead (P2) | **Open** | 55/55 `watchlist`, 8 of them owned |
| `agent_idempotency_keys` empty (P2) | **Open** | **0 rows** after ~60 agent writes |
| DATA-2 `price_basis` (P2) | **Open** | No column |

---

## 5. Structure, process, workflow

The layout, conventions, and invariants in `CLAUDE.md` are accurate and were
useful for this review. Two structural observations:

**Pipeline state is stored as research signals.** `inflectionTransitionCause`
returns `data_completeness` when only `completeness`/`stale` changed, and
`scoreInflectionUniverse` writes a `signals` row for it. So every time the
store lags the session clock — a late vendor, a holiday, a manual re-run — 30+
rows land in the inbox saying "VST: Falling fundamentals → Falling
fundamentals", and 30 more land when the store catches up. The signals table is
now 84% pipeline log. The 03:07 UTC schedule pushed to production yesterday
(and not yet run as of this review) should cut the *late-vendor* flips. It does
nothing for the holiday flips, and it does not change the design: a scorer run
should record its own health in its own row (`instrument_setups` already has
`stale` and `completeness`), and a signal should mean "look at this name".

**No table knows when a company reports.** Rituals 1 and 3 (catalyst review,
calendar fill) depend on earnings dates, and the agent supplies them from
memory into `review_tasks`. There is no `earnings_events`/`documents` feed, so
the calendar is only as complete as the last chat. Today it has no Q3 earnings
row for any held name. The 8-K/10-Q filing itself arrives via the SEC ingest
into `fundamentals_vintages` with a `knowable_at`, which is a date the calendar
could learn from retroactively ("ISRG's last four 10-Qs were filed on …") even
before a forward calendar exists.

Otherwise the working rhythm — migration before ad-hoc write, `db reset` before
`db push`, commit freely / push on confirmation — is being followed and the
commit history reads like reasoning rather than changelog. Keep that.

---

## 6. Gaps, inconsistencies, bugs, unaccounted risks

### 6.1 Process inconsistencies

| Finding | Why it matters |
|---|---|
| Weekly review skipped the week of 8–12 Sep (10-day gap) | The `thesis_review` Due flag fires at 7 days; the process document says weekly. One miss is noise; measure it, do not excuse it |
| `decision_outcomes` = 0 after 57 decisions | Ritual 12 (calibration) has no input. The 30 Aug enters are 19 days old with a −13.8% sleeve — that is exactly the row that should be graded |
| No earnings tasks for held names in the next 45 days | Ritual 3 says 2–3 months. ISRG and VRT report in ~5 weeks |
| Held names are `investigate` dossiers and `watchlist` instruments | Ritual 5 (hygiene) has no state to move things into. Fixing `status` is the enabler |
| BWXT pending at $745 since 5 Sep, no `due_by` | A "buy if it reclaims" stub with no date is a condition, not a planned action; it will sit as clutter or be confirmed on impulse |
| `agent_idempotency_keys` empty | Agent retries can double-write decisions and tasks. The API supports keys; the agent is not sending them, and nothing on the server *requires* them for POSTs |

### 6.2 Mandate vs code

| Rule | Doc | Code |
|---|---|---|
| Kill-switch 15% | Diagnostic in Phase 1; buy override after | `shouldHaltNewRiskForKillSwitch` halts only above $75k. **Matches.** But the halt also blocks `sell`/`reduce` planned actions via the direction-blind gate (§1.1b) — the mandate never intended that |
| Max position | "cost and/or market — never chosen" | Still market value vs NAV. Still not chosen |
| Benchmarks total-return | Required | ~~Price return with a TR label~~ — **struck 19 Sep, this finding is wrong.** It restates one the [3 Sep remediation log](./2026-09-03-remediation-log.md) §10 had already struck on 7 September, which said so precisely to stop it being "fixed" later. Re-verified against production: SPY has 0 null `adj_close` across 1,000 bars and 940 differ from `close`, and `performance.ts:203` reads `adj_close ?? close`. The comparison is already total-return |
| Deposits/withdrawals | Mandate allows | `computeDrawdown.navDrawdownPct` uses raw NAV peak; `getPerformance` uses the unitized index. They disagree after the first withdrawal |
| Rule 4 written invalidation | Required on every position | **Met** 8/8 |

### 6.3 Coding and data bugs

| Sev | Area | Issue |
|---|---|---|
| **P0** | Queue confirm | `confirmPlannedAction` ignores `action_type` and always calls `bookFill`. A `reduce`/`sell` confirmed from the queue books a **buy**. Route by type: `sell`/`reduce` → the sell path (`sellPosition` with the planned action id), `buy`/`add` → `bookFill`. Refuse to render a Confirm-as-fill form for a sell row. Add a test that a queued `sell` produces a `sell` transaction and a negative quantity delta. |
| **P0** | Mandate gate | `mandateGate` evaluates every planned action as a purchase. `createPlannedAction`/`updatePlannedAction` must skip the buy gate for `sell`/`reduce` (or run a sell-specific check: position exists, quantity ≤ held). Otherwise the kill-switch halt blocks de-risking above the Phase-1 cap. |
| **P1** | Session vs UTC day | `contributionFromLedger` (`holdings.ts:266,347`) and `fillSession` (`decision-returns.ts:55`) bucket fills by **UTC** day; snapshots and flows bucket by `fillSessionDate` (New York day). A fill booked 20:00–24:00 ET lands on the *next* session for contribution and decision-return maths while the NAV series puts it on the booking day. Every live fill so far was booked before 19:30 ET, so the series agree today by luck. This is the 2 Sep P0 in miniature; use one function. |
| **P1** | Signals | `data_completeness` transitions written as signals. 296/351 rows. Stop writing them; the setup row already carries `stale`/`completeness`. Add a `scorer_runs` (or reuse a job-log) row per run with counts so pipeline health is visible without polluting the inbox. |
| **P1** | Holiday calendar | `lastCompletedCashSession`/`lastWeekdayOnOrBefore` know weekends only. Measured effects: 32 spurious signals on 8 Sep; `bars-if-stale` will re-ingest on every US holiday; `priceDataStale` gates ritual 8 for a day. SPY's stored bars are already the calendar for snapshots — use them here too, with a small static holiday list for the *next* session (bars cannot tell you a holiday is coming). |
| **P1** | Benchmarks | Label says TR, data is PR. Fix the label now (one line), the data when a dividend-adjusted source exists. |
| **P1** | `updatePlannedAction` | `cancelled` → `pending` revival is exempt from the open-status check and the gate re-runs only on `planned_usd`/`action_type` change. A cancelled buy that now breaches a cap can be revived ungated. Re-run the gate whenever status becomes `pending`. |
| **P2** | `withActor` | Stacks `[agent:x]` on every PATCH with `actor_name`. Live: ISRG and MRCY planned actions read `[agent:chatgpt] [agent:chatgpt]`. Prepend only when the text does not already start with the tag. |
| **P2** | `instruments.status` | Never set to `active`; `archived` only read as an exclusion. Add: `bookFill` → `active`; last sell → back to `watchlist`; an archive operation on the agent API. |
| **P2** | `bookFill` retry | Post-ledger failures return `{ ok: false }` after money moved; unplanned fills have no idempotency key. Give the manual fill form a client-generated key and a unique index. |
| **P2** | `listDecisions` | Unbounded select loaded on every Briefing render. 57 rows today; PostgREST truncates at 1,000 silently. |
| **P2** | Agent idempotency | Server accepts `Idempotency-Key` but does not require it on mutating routes. Require it for `createDecision`, `createPlannedAction`, `createReviewTask`, `completeReviewTask`. |
| **P2** | `computeDrawdown` NAV | Raw-peak NAV drawdown vs unitized elsewhere. Pick the unitized one. |
| **P2** | `verify_book_against_ledger()` | Exists, tested in `ledger.sql`, **never run against production**. Should run after `snapshot:portfolio` in the scheduled job and fail the run if any row is `not ok`. Cheap; catches a `positions`/`transactions` split-brain the day it happens. |
| P2 | `documents` table | Zero rows; nothing writes it. Either wire the SEC filing index into it (filing date, form, URL per `fundamentals_vintages.knowable_at`) or drop it from the schema and the plan. |
| P2 | DATA-2 `price_basis` | Still no column; a Stooq fallback would silently write raw closes into `adj_close`. |
| P3 | Rate limit | In-process `Map`; per-lambda on OpenNext. Public 60/min is not enforced. |
| P3 | Queue empty-state copy | "No pending buys" — the queue also holds sells. Cosmetic, but it reflects §1.1. |

### 6.4 Risks not in the mandate

| Risk | Note |
|---|---|
| **The book is losing to the benchmark and the mandate has no relative-return clause** | Everything in the mandate is absolute (15% sleeve, NAV preservation). A sleeve that does −13.8% while SPY does −2.4% passes every rule. Phase-1 → Phase-2 transition should require a *relative* proof, or say explicitly that it does not. |
| Kill-switch is inert in Phase 1 by design | Correct per mandate. But it means the only automated risk control that can *block* anything has never fired, so its integration (§1.1b) is untested by use. |
| Concentration in one factor | Diagnostics attribute ~81% of losses to the AI-infrastructure factor. The AI-capex cap exists; the diagnostics suggest the *rest* of the book is also that factor under other theme names (CLS, VRT, NVT, CRDO, NBIS). Theme caps are not factor caps. |
| Coinbase commingling, viewer accounts, public book | Unchanged from 2 Sep. Still not a written decision in the mandate. |
| Decision calibration has no data | 57 decisions, 0 grades. A process that never scores itself cannot learn which of its rules are load-bearing. |

---

## 7. Architecture gaps

Ordered by how much they block a ritual.

1. **No earnings/filing calendar source.** Rituals 1, 3, 7 depend on dates
   the system does not store. Minimum: a `company_events` table fed from the
   SEC ingest (`knowable_at` of each 10-Q/10-K as a *past* filing date) plus
   a manual/agent-written forward date. Then Calendar can show "ISRG: last
   four filings 21 Oct / 22 Jan / 22 Apr / 22 Jul — next expected ~21 Oct" and
   Due can flag a held name with no review task inside its window.
2. **No sell path from the queue** (§1.1a) and **no sell-aware gate** (§1.1b).
3. **Pipeline health lives in the signals table.** Needs its own row per run.
4. **Trading calendar is weekday-only.** Snapshots learned to use SPY's bars;
   dates.ts did not.
5. **`documents` exists and is unused.** Decide.
6. **Ledger verification is test-only.** Run it in production nightly.
7. **Two session functions for one concept.** `utcDay` vs `fillSessionDate`.

## 8. Model and logic gaps

- **Scorer evaluation is blocked on a point-in-time watchlist**, not on more
  tuning. The 53-name universe is the *surviving* universe; every replay on it
  is biased toward names that worked. The cheapest fix is to start recording
  `watchlist_membership (instrument_id, added_at, removed_at, reason)` from
  today so that in twelve months a replay can be run on "names we were
  actually watching on date D". This costs one table and one trigger now and
  is impossible to reconstruct later.
- **Relative return is not measured against anything the mandate cares about.**
  `getPerformance` computes sleeve vs SPY/QQQ; no ritual outcome is *required*
  to quote it, and no rule reads it.
- **The 15% diagnostic has no memory across episodes.** Each diagnostic is
  answered fresh. Three "factor compression, hold" conclusions in five weeks
  should be visible to the fourth as a prior ("this is the third time; what
  would make this one different?"). The historical review gate does load prior
  diagnostics — the *instruction* should demand the count be stated.
- **Position sizing is dollar-fixed** ($3–5k starters) regardless of the
  name's volatility. NBIS at $1.5k and VRT at $5k have very different dollar
  risk per unit of thesis. The plan lists "sizing aids from volatility" under
  Phase 3; with a sleeve this volatile it is worth pulling forward the *display*
  (dollar-at-risk to invalidation per position), not the automation.

---

## 9. Tests

315 tests in 49 files, up from 199/38 on 2 Sep. The additions are the right
kind: `snapshot-alignment.test.ts` asserts stored-data invariants (marks from
the session, no duplicates, flows on the session); split-signature and
discontinuity guards are tested with the APH case; freshness has fixtures.

Still not tested, and each is a finding above:

- A queued `sell` produces a `sell` transaction (would have caught §1.1a).
- `mandateGate` with `action_type: 'sell'` does not evaluate as a buy (§1.1b).
- A fill booked at 23:00 ET lands on the same session in `contributionFromLedger`
  as in `reconstructSnapshots` (§6.3 P1).
- `withActor` is idempotent.
- A scorer run in which only `stale` changed writes **no** signal row.
- `lastCompletedCashSession` on a US holiday returns the previous session.
- `verify_book_against_ledger()` returns all `ok` on the production schema
  after a buy and a sell (the SQL suite does this locally; nothing runs it
  where the money is).

`apps/worker` and `packages/data-clients` still have essentially no in-package
tests; the logic that matters (`inflection.ts`, `snapshots.ts`, `bars-*.ts`)
was extracted to `packages/domain` and is tested from web, which is the right
pattern.

---

## 10. What to work on next

In order. Each item is one commit-sized change with a test; the first three are
a single afternoon and remove the two P0s.

1. **Make the queue sell.** `confirmPlannedAction` routes on `action_type`;
   `reduce`/`sell` go through `sellPosition` with `planned_action_id`; the
   queue shows "Confirm sale" and a quantity ≤ held check. Test: queued sell →
   `sell` transaction, position reduced, cash credited.
2. ~~**Make the gate know direction.**~~ — **done 18 Sep** (`9ffd429`). `side`
   is required, sells skip the caps and the kill-switch and check only that the
   position exists, and the sell path does not read the drawdown series at all.
3. **Re-gate revived actions and fix `withActor`.** Two one-liners with tests.
4. **Stop writing `data_completeness` signals.** Record run health in a
   `scorer_runs` row (started, finished, scored, stale count, transitions).
   Then delete the 296 existing rows by migration so the inbox is readable.
   After this, the signals table should say "why look now" again.
5. ~~**Run `verify_book_against_ledger()` in the nightly job**~~ — **done
   19 Sep.** `verify:book` runs after `snapshot:portfolio` in both ingest paths
   and fails the run on a mismatch. It also checks the append-only guards are
   armed, which the reconciliation alone cannot see: it compares a projection to
   the ledger, so a rewritten ledger moves both sides together and still passes.
6. **One session function.** `contributionFromLedger` and `fillSession` use
   `fillSessionDate`. Test with a 23:00 ET booking.
7. **Holiday-aware session clock.** Use SPY bars as the calendar where a
   store exists; a static NYSE holiday list for forward dates. Confirm the
   `bars-if-stale` job does not re-ingest on Columbus Day (12 Oct).
8. **`instruments.status` lifecycle** (`active` on fill, `watchlist` on exit,
   `archive` op on the agent API) — unblocks ritual 5 and makes Explore
   distinguish owned from watched.
9. ~~**Start `watchlist_membership` today.**~~ — **done 18 Sep** (`af6d08d`),
   live in production with 55 seeded names and `watchlist_as_of(t)` answering.
10. **Earnings dates.** `company_events` fed from SEC filing dates plus an
    agent-writable forward date; Due flags a held name with no review task
    inside its reporting window. Then ISRG/VRT get their October tasks by
    construction rather than by memory.
11. ~~**Fix the TR label**~~ — **struck 19 Sep**, see §6.2: the benchmark is
    already total-return and this repeats a finding struck on 7 September. Pick
    the unitized NAV drawdown in `computeDrawdown`; that half stands.
12. **Grade the 30 Aug enters.** Not software: run ritual 12 once so
    `decision_outcomes` has rows and the calibration ritual has something to
    calibrate.

For the mandate (operator decisions, not code): (a) state whether the Phase-1
→ 2 transition requires a *relative* return proof; (b) say what the fourth
identical drawdown diagnostic must do differently; (c) choose cost or market
for the position cap; (d) write down the public-book decision.

---

## 11. Live inventory (measured 2026-09-18 09:56 Bangkok)

| Object | Count / state |
|---|---|
| Instruments | 55, all `watchlist`, all USD |
| Positions | 8 open, 0 closed |
| Transactions | 9 (1 deposit, 8 buys, 0 sells) |
| Decisions | 57 (42 hold, 11 enter, 4 watch, 0 reduce/exit) |
| Decision outcomes | **0** |
| Review tasks | 30 (18 completed, 12 pending; 5 completed portfolio-scope incl. 3 drawdown diagnostics) |
| Planned actions | 10 (1 pending BWXT, 2 deferred, 1 cancelled, 6 confirmed) |
| Signals | 351 (296 `data_completeness`, 26 crowding, 16 new quarter, 13 price; 256 `X → X`) |
| Dossiers | 53 (52 investigate, 1 active_thesis); versions 109 |
| Documents | **0** |
| Fundamentals | 2,385 vintages; 2,032 quarterly projection rows |
| Market bars | 64,911; newest 2026-09-16 for SPY, QQQ and every holding |
| Snapshots | 25 sessions 12 Aug → 16 Sep; `as_of` = session 22:30Z; 0 alignment issues |
| Agent idempotency keys | **0** |
| NAV / cash / invested / MV | $247,233.47 / $222,499.88 / $27,500.12 / $24,733.59 |
| Deployed sleeve | −13.8% since inception; DD 15.2%, max 17.0% (unitized) |
| Tests | 315 passing / 49 files; typecheck clean; tree clean at `1790570` |

The 03:07 UTC ingest and the 05:07 UTC stale-gated retry were pushed on 17 Sep
and had not yet had a scheduled run at review time. The store being one session
behind at 09:56 Bangkok is expected under the new schedule and is not a finding.
Whether the retry actually closes the vendor-lag gap should be checked against
`bars:freshness` on Monday 22 Sep, after four scheduled mornings.

---

## 12. Addendum, 19 September — process debt found by using the learning loop

Found while building the first calibration worklist against production, not by
reading code. Recorded here rather than fixed, because the sequence agreed with
the mandate is to run the first calibration before adding more machinery.

**Three `enter` decisions can never be graded, and drop out of the worklist
without saying so.** There are 11 `enter` decisions against 8 buys:

| Decision | What it is |
|---|---|
| VST, 27 Aug | An intent-shaped enter with no fill; the 28 Aug enter is the executed one |
| ISRG, 30 Aug | Same pattern; the 31 Aug enter is the executed one |
| SNDK, 30 Aug | An intended entry that never executed at all |

The first two look like the entry being journalled first and `bookFill` then
logging a second `enter` when the fill was confirmed, so the journal carries two
rows for one entry and only the second is measurable. SNDK is a different thing:
economically it is closer to a `watch` — a candidate we decided to buy and did
not — than to an entry.

The modelling issue underneath is that the system infers what a decision *meant*
from whether a fill happened. An investment intention and an executed position
decision are different objects and should not be told apart by a join. That is a
schema refinement to make from use, not ahead of it.

What matters sooner is that these rows are excluded *silently*. A future
worklist should carry `ungradeable_reason: no_fill` rather than omit them: "why
did this decision never become measurable" is itself calibration evidence.
Duplicate pre-fill enters say something about journal semantics; SNDK says
something about opportunity cost.

**Consequence for the first cohort.** 15 decisions are due a 30-day grade — 5
position-originating and 10 continuation — and the entry cohort is 5 names
(VRT, CLS, NVT, MRCY, NBIS), not 11. Four of the five are substantially the same
AI-infrastructure exposure. The ritual 12 record should describe it that way: a
small, highly correlated cohort that is an early test of deployment, factor and
timing process rather than five independent demonstrations of stock selection,
with continuation decisions analysed separately from position-originating ones.

---

## 13. Backlog from the first live calibration — 19 September

The first 30-day cohort was graded end to end. The run reconciles: **15 outcome
rows across 15 distinct decisions, all `horizon_days = 30`, zero duplicate
`(decision_id, horizon_days)` pairs, zero unknown decision ids**, 5
position-originating and 10 continuation, and `horizon_due=true` returns nothing
afterwards. The explicit-horizon design works.

What follows is the improvement list the run produced. Ordered by whether
something is already true, cheap, or a build.

### 13.1 Already closed by the run

| Item | State |
|---|---|
| Batch approval for a calibration run | Done — `gpt-agent-process.md` hard rules now allow a defined batch stated before the first write and not widened after |
| Grades must not be derived from returns | Doctrine, ritual 12c: returns are evidence handed to the grader, never an algorithm that assigns the grade. The live run is the argument — see 13.5 |
| Point-in-time evidence rule | Doctrine, ritual 12b. An `evidence_cutoff_at` field would make it machine-checkable; see 13.3 |
| `decision_id` on journal entries | Done 19 Sep — the entry now carries `decision_id` alongside `id` |

### 13.2 Cheap, not yet done

| Item | Note |
|---|---|
| **Post-run reconciliation diagnostic** | The check run by hand above: expected due `(decision_id, horizon)` pairs vs recorded, duplicates, missing, unexpected, and horizons still owed. Belongs in the agent surface or a worker command so a run is auditable without counting 15 ids by hand. The unique index cannot substitute — a grade against the *wrong* decision is a valid row |
| **`ungradeable_reason` in the calibration universe** | `relative_returns.reason` already says `no_fill`, but such decisions never appear in `horizon_due` at all, so a completeness check cannot see them. A quarterly view should be able to report "3 enters ungradeable: `no_fill`" rather than silently omitting them (§12) |

### 13.3 A purpose-built calibration read surface

Today the agent assembles decision id, class, anchor, horizon, benchmark return
and pinned belief from a general journal payload. A dedicated worklist would
carry `decision_id`, `decision_type`, `decision_class`, `anchor_date`,
`due_horizons`, the horizon return, SPY/QQQ, relative return, the pinned
`dossier_version`, and `evidence_cutoff_at` — the last making ritual 12b's
point-in-time rule checkable rather than only stated.

**Constraint: derive it from the canonical journal logic.** A second calculation
path for decision returns is exactly the "two session functions for one concept"
failure in §7.7, and it would be worse here because the two would disagree about
grades rather than dates.

### 13.4 Class-aware analytics, and a stronger reason for it

Report `position_originating`, `continuation` and `risk_changing` separately
rather than pooled. The run gives a measured reason beyond the argument from
first principles:

| Dimension | Varies within a name? |
|---|---|
| `thesis_grade` | **0 of 5 names** |
| `timing_grade` | 2 of 5 |
| `sizing_grade` | 3 of 5 |
| `risk_management_grade` | 2 of 5 |

`thesis_grade` was identical across every decision on the same name. So the 15
grades contain **five** independent thesis judgements, not fifteen, and a report
saying "12 of 15 decisions had a correct or partly-correct thesis" would restate
five name-level calls three times each. Analytics must carry distinct-name counts
alongside decision counts, not only the class split.

The other three dimensions *do* vary within a name, which is the first evidence
that the four-dimension schema earns its keep: they carry information the thesis
grade does not.

### 13.5 Decision outcome is not investment outcome

A hold can be a good decision on a name that falls — holding a deliberately small
speculative position while correctly refusing to add is the clearest case. A
stock can rise after a badly reasoned decision. The four dimensions already
express this and the schema does not need changing. The risk is in presentation:
any future dashboard that reduces this to a win rate or a relative-return hit
rate throws away the thing the loop was built to measure.

### 13.6 Explicitly not to be encoded yet

The first cohort reads as weak entry timing with better subsequent sizing and
capital discipline. It is five correlated names over thirty days, and the August
starters partly existed to exercise an operating system that had never run with
money in it. Do not turn that into automated thresholds or mandate changes. Let
the 90- and 180-day cohorts and later entries carry the weight.

### 13.7 The success criterion

The next due cohort should be gradeable without inspecting the database or
asking what an identifier means. The first run shook out exactly the operational
ambiguity a live calibration was meant to expose — the `dossier_version.id`
confusion (`d913f0c`) and the missing `decision_id` (13.1) were both found by
grading, not by reading code.
