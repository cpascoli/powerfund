# PowerFund — full review, 15 November 2026

Fifth full review. Same shape as [2026-10-13](./2026-10-13-full-review.md):
intent → capital → software → process → bugs → tests → what next, with one
addition the operator asked for — §6 is a dedicated assessment of the month's
changes to [gpt-agent-process.md](../gpt-agent-process.md). Reads the 13 October
review's §7.3 bug table and §11 ordered sprint as the live list and closes or
carries each item in §4.3.

Measured against production on **15 Nov 2026, ~09:40 Bangkok** (= 14 Nov
21:40 ET, a Saturday; the last completed cash session is Friday 13 Nov and the
store reaches it). Every number below is from read-only PostgREST queries
against the production project, from `snapshot:verify`, `bars:freshness` and
`verify:book` (all dry runs), from the GitHub Actions run log, or from the repo
at `37792ee` (7 Nov; `main` even with origin; three untracked files, §4.1).
Typecheck clean across all five workspaces; **695 Vitest tests in 72 files
pass** (694/72 on 13 Oct — one test added in a month). The SQL suites were not
run (no local stack); the new `function_access.sql` has never run anywhere.

Where a claim is inferred from reading code rather than reproduced, it says so.

---

## 1. Verdict

**The month tested the process, not the software, and the two came out
opposite. The book took a real factor drawdown — the deployed sleeve is −26.8%
since inception against SPY −2.3%, with a 36.0% maximum drawdown on 5 Nov —
and the operating process responded with discipline: no panic sale, no
price-only averaging into the AI complex, three diagnostics, the first 90-day
grades on schedule, and two new gates that demonstrably stopped a bad add.
The software, meanwhile, did not move. Of the eleven commits since 13 October,
eight are documentation; no file under `apps/worker`, `packages/` or
`supabase/` changed. Every code item in the last review's sprint is still
open, including the P0: anyone holding the public anon key can still read
every position, quantity, cost basis and the cash balance. That was verified
again today.**

Thirty-three days after the last review:

| Series | 13 Oct review (9 Oct closes) | Today (13 Nov closes) |
|---|---|---|
| Unitized deployed sleeve since inception (12 Aug) | −5.9% | **−26.8%** |
| SPY / QQQ over the same window (price; §4.3 on TR) | +0.8% / +3.8% | −2.3% / −6.1% |
| Sleeve relative to SPY / QQQ | −6.6 / −9.7 pp | **−24.4 / −20.7 pp** |
| Deployed drawdown from peak (unitized) | 7.4%, max 17.0% | **28.0%, max 36.0%** (5 Nov) |
| Deployed sleeve on cost | −1.0% ($36,106 on $36,467) | **−22.5%** ($29,795 on $38,468) |
| NAV | $249,640 (−0.1%) | **$241,327 (−3.5%)**; low $238,016 on 5 Nov |
| NAV relative to SPY / QQQ | −0.9 / −3.9 pp | −1.2 / **+2.6 pp** |
| Cash | 85.5% of NAV | 87.7% of NAV |

Between the two reviews the sleeve returned about **−22%** against SPY −3.1%
and QQQ −9.5%. NVDA, which the book does not hold but which is the factor,
fell 29% over the same stretch. Six AI-infrastructure names carry **93% of the
unrealized loss** ($8.1k of $8.7k). Cash did what the mandate hired it to do:
NAV is down 3.5% and its maximum drawdown is 5.0%. Both statements are true,
and the November reviews are right to refuse the comfortable one — the 7 Nov
diagnostic says in so many words "do not present NAV-relative outperformance
as good stock selection".

### 1.1 Headline findings

**(a) The book leak is still open, 33 days after it was found.** With the
anon key, `POST /rest/v1/rpc/verify_book_against_ledger` returned 23 rows
today (and `ledger_guard_status` 8). The fix exists: a migration and a SQL
suite sit **untracked** in the working tree, both dated 13 October, never
committed, never run in CI, never pushed. A second reader found the migration
correct and complete (§7.3). This is a ten-minute close that has waited a
month while the process document grew by 40 KB. It is the first item of §11
and nothing else should go ahead of it.

**(b) Software stalled while process accelerated.** `gpt-agent-process.md`
went from 971 to 1,273 lines (73 KB → 113 KB, +55%) and gained three gates.
The code gained a derived discovery index and a CI runtime bump. Three of the
new process rules exist *because* a software object is missing (a structured
valuation model, an event source, a factor gate), and each says so. The gap
between what the prose demands and what the server can check is now the
project's central architectural fact (§6.4, §8).

**(c) Two unpaged bar reads are about to cross PostgREST's 1,000-row cap
(inferred from code and row arithmetic, not yet reproduced).** The grading
path (`lib/data/decision-returns.ts:187`) loads bars for every instrument
that has a decision, plus SPY, since the first decision: 14 instruments × 67
sessions is 938 rows today and passes 1,000 at session 72 — **Friday 20
November, this week**. The NAV rebuild (`apps/worker/src/snapshot/portfolio.ts:166`)
does the same for ledger instruments: 737 rows today, over 1,000 at session
91, **around 18 December**, sooner with a twelfth name. Both order ascending,
so the rows cut are the newest. In the snapshot the missing marks are carried
forward as `staleMarks`, which the alignment check exempts, so the job would
exit green while writing flat position values into the series the kill-switch
reads. This is the "marks come from the snapshot's own session" invariant on
a timer (§7.3 P1).

**(d) The scheduler is later than it was, and the operator is now the
primary trigger.** The "03:07 UTC" cron landed between 07:41 and 10:59 UTC
this month and has sat at 10:42–10:59 (+7h35 to +7h52) every day since 3 Nov.
There were **23 manual `workflow_dispatch` runs across 24 ingest days** (6 in
11 days at the last review). The November monthly pass was started against
stale closes and had to wait for a hand-fired run.

**(e) The new gates have left the book with no decision-grade valuation at
all.** After the 3 Nov underwriting gate, 7 of 11 held dossiers carry the
required `### Valuation` block and all 7 say `PROVISIONAL`; the other 4 (CEG,
KTOS, MRCY, VST) have no block. Zero names anywhere are `DECISION-GRADE`. By
the document's own rule no `buy`/`add` can currently be authorised, so
deployment is halted by process rather than by a recorded capital decision
(§6.2).

### 1.2 What the last review got right, and what it left

It was right that the 90-day cohort would be the real test of the grades
(§3.6), right that MRCY's next decision needed a pre-committed alternative to
a twelfth hold (it became an add — §3.5), and right about Thanksgiving, which
is now eleven days out with the holiday calendar unbuilt. It did not see the
snapshot paging cliff, the missing horizon check on grade writes, or that the
ingest command can exit green with every symbol failed, or that the sleeve
return is wrong on a day with a sale (§7.3).

---

## 2. Two roadmaps

Unchanged: **software Phase N never authorises capital Phase N**. Capital is
Phase 1 ($75k invested-cost cap, ~$10k/month baseline); invested cost is
$38,467.85, 51.3% of the cap. Software is Phase 1 with Phase 2 machinery built
and the Phase 3 minimum slice live. `$150k` and `$225k` remain proposals. The
November pass recorded "Phase 1, high cash is deliberate, not a spending
quota" as a capital decision in a capital ritual.

One thing changed in kind. Until October the capital ladder was ahead of the
software ladder — money was live before the risk tooling was. This month the
*process* ladder pulled ahead of both: the agent is now asked to enforce
valuation status, event materiality and staged sizing with no field, no
endpoint and no test behind any of them.

---

## 3. Capital roadmap

### 3.1 Live book (13 Nov 2026 close)

| Symbol | Theme | Opened | Cost | MV | P&L | Since 9 Oct | Dossier | Valuation status |
|---|---|---|---|---|---|---|---|---|
| VRT | ai-infrastructure | 12 Aug | $5,000 | $3,407 | −31.9% | −16.8% | active_thesis | PROVISIONAL |
| CLS | ai-infrastructure | 13 Aug | $5,000 | $3,450 | −31.0% | −33.6% | investigate | PROVISIONAL |
| NVT | ai-infrastructure | 13 Aug | $4,500 | $3,019 | −32.9% | −31.5% | investigate | PROVISIONAL |
| MRCY | defence | 13 Aug, +15 Oct | $4,501 | $4,062 | −9.8% | +2.4% | investigate | *no block* |
| NBIS | ai-infrastructure | 13 Aug | $1,500 | $685 | **−54.3%** | −47.6% | investigate | PROVISIONAL |
| VST | energy | 28 Aug | $3,000 | $2,849 | −5.0% | −17.6% | investigate | *no block* |
| ISRG | robotics-ai | 31 Aug | $3,000 | $3,559 | +18.6% | +4.6% | investigate | PROVISIONAL |
| CRDO | ai-infrastructure | 2 Sep | $3,000 | $2,323 | −22.6% | −39.3% | active_thesis | PROVISIONAL |
| KTOS | defence | 28 Sep | $1,994 | $1,531 | −23.2% | −19.9% | investigate | *no block* |
| SNDK | ai-infrastructure | 1 Oct | $3,973 | $2,018 | **−49.2%** | −44.1% | investigate | PROVISIONAL |
| CEG | energy | 9 Oct | $3,000 | $2,892 | −3.6% | −6.0% | active_thesis | *no block* |

Invested cost $38,467.85; cash $211,532.15; ledger sum and
`portfolio_state.cash` agree to the cent; `verify:book` 23 checks, 0 failing,
0 guards disabled; 67 session-keyed snapshots, `alignmentIssues: []`,
`staleSessions: []`, every `as_of` at 22:30Z. All eleven positions carry a
written invalidation. By market value: AI infrastructure $14.9k (50% of the
sleeve, 6.2% of NAV), energy $5.7k, defence $5.6k, robotics $3.6k.

Eight of eleven held dossiers are still `investigate` (nine at the last
review; CEG moved). Two held dossiers have gone stale against their own
prints: **VST** was last written and verified on 5 Sep although its Q3 was
reviewed on 7 Nov, and **KTOS** was last verified 25 Sep, has no
`next_review_at` (carried from 13 Oct), and its Q3 review on 7 Nov did not
reach the dossier.

### 3.2 What happened

A rates shock on 14 Oct (hot CPI) opened the drawdown; the Q3 prints through
late October were operationally strong and the stocks fell anyway; the
election on 3 Nov took the sleeve from −15.9% to −31.2% on cost in two
sessions (4–5 Nov); and on 12 Nov the agent recorded an unscheduled NVIDIA
leadership event and wrote an emergency book review within a day. Throughout,
the book's own reading was "correlated AI-capex valuation and factor
compression plus poor entry timing, not a verified operating-thesis collapse".

That reading is defensible name by name — VRT, NVT and CLS all printed strong
orders — and it is also the sixth consecutive diagnostic to reach it (§3.6).
The more important admission came from the valuation audit rather than the
diagnostics: VRT's 24-month weighted value was cut from ~$417 to ~$283 once
its 2028 EPS was rebuilt bottom-up, and the November pass marked the models
for NVT, CLS, CRDO, SNDK and NBIS provisional. The operating theses may be
intact; **the prices paid in August were underwritten on earnings and
multiples that the process now says it cannot support.** That is a thesis
finding, not only a timing one, and the grades do not yet record it as such.

### 3.3 Capital Phase-1 evidence scorecard

| Proof | 13 Oct | Today | Evidence |
|---|---|---|---|
| Every fill through the queue with thesis and invalidation | Met | **Met** | 12 buys; 10 via confirmed planned actions; the 15 Oct MRCY add confirmed through the queue and stamped |
| Weekly holding review persisted | Met, slipped twice | **Met, slipped a third time** | Holds 10, 16–17, 24 Oct, 3 Nov, 10 Nov (11 names each from 24 Oct). 24 Oct → 3 Nov is the third ten-day gap in thirteen weeks |
| Monthly book pass + ranking | Met | **Met** | `Monthly book pass — 2026-11` completed 3 Nov (due 1 Nov, a Sunday; held for fresh closes); December rolled |
| Quarterly review | Met (Q3) | Not due | Q4 scheduled 2 Jan |
| Drawdown diagnostic when breached | Not triggered | **Met ×3** | 15 Oct (15.6%), 24 Oct (24.1%, +5 pp rule), 7 Nov (32.8%, +5 pp and 14-day rules). The 29.1% re-open threshold was crossed by the 5 Nov close at the latest; the covering write is dated 7 Nov on 6 Nov closes |
| Decision grades | 44 at 30 days | **95: 85 at 30 days, 10 at 90** | First 90-day grades written 12 Nov, on schedule. `ChatGPT`/`chatgpt-mcp` wrote 63 |
| Pre-event risk decision | — (new) | **Met once, missed once** | NVDA Q3 (17 Nov): created T−10, decided T−7. The 3 Nov election had only an *after*-the-event macro task; ritual 15 was written because of it |
| Sell path exercised | Not met | **Not met** | 133 decisions, 0 `reduce`/`exit`; 13 transactions, 0 sells. Through a 36% sleeve drawdown |
| Track record vs benchmark | −6.6 pp vs SPY | **−24.4 pp vs SPY** | §1 |
| Catalyst calendar | Met (79 pending) | **Thinning** | 24 pending: 10 in Nov, 12 in Dec, 2 in Jan. Ten tasks created in 33 days; the Q4 earnings season (late Jan – Feb) is not on the calendar yet |

### 3.4 Deployment pace

$2,001 deployed since 13 Oct (the MRCY add). September $5k, October $9k,
mid-October to mid-November $2k. A $1,000 VRT staged add was queued on 31 Oct
and deferred on 3 Nov. The mandate's ladder says a sleeve drawdown that
classifies as a valuation shock is an occasion to "diagnose, then deploy per
this ladder if the checklist passes", and that cash above plan for two
consecutive reviews must be deployed or explained. Both November writes
explain it (SLOW/SELECTIVE, no correlated adds, independent-factor names only
if they clear), so rule 3 of the ladder is being followed as written.

What is not written is the consequence of §1.1e. With no decision-grade model
on any name, "selective" has no eligible candidates: the ladder is suspended
until re-underwriting produces one. That may well be the right posture three
weeks into a factor shock — but it is a capital decision, and it should be
recorded as one ("deployment paused pending re-underwrite of N names, target
date D") rather than emerge from a research backlog.

### 3.5 The MRCY add — the one fill of the month

Worth reading closely because it is the first add the book has made and the
only money that moved.

- 10 Oct hold: keep the add deferred "until roughly $75 or lower with thesis
  intact, **or** stronger operating evidence"; "do not relax the gate merely
  because price is closer to it".
- 15 Oct 04:34 UTC: the drawdown diagnostic at 15.6% records that the
  operator's $75 limit order had not filled, and says to re-place it only
  after the AUSA review.
- 15 Oct 04:40 UTC: the AUSA review is written — "no material new Mercury
  order or financial disclosure emerged … does not increase intrinsic value"
  — and approves a $2,000 add at $75 or lower.
- 15 Oct 07:43 UTC: the staged-add rule is committed to the process document.
- 15 Oct 11:43 UTC: 27 shares at $74.12, 26 days before the Q1 FY27 print the
  remaining tranche was reserved for.

Read against the rules: the add was within a pre-declared valuation trigger
(set in August, restated on 30 Sep and 10 Oct), sized at half the original
intent with the rest reserved for a named print, in a name outside the AI
factor — all of which is the staged-add rule working as designed. It was also
an add into a −27% position, on the day of a 15% diagnostic, with no new
financial evidence, on a dossier that has never carried a valuation block,
authorised by a rule committed three hours after the decision it permits.
The outcome so far is fine (MRCY $81.42, +9.8% on the tranche; the 10 Nov
print showed bookings and margin on track and free cash flow negative). The
process point stands regardless of outcome: **mandate rule 5 was reinterpreted
in the same session that used the reinterpretation.** §6.3 returns to this.

One software wrinkle from the same fill: the journal holds two `add` rows for
it — the intent written at 04:40 and the one `bookFill` wrote on confirmation.
Ritual 12e already describes this shape for enters; it will produce a
`no_fill` row in every calibration run until the confirm path links to the
planned action's existing decision instead of writing a second one.

### 3.6 Calibration: 95 grades, still no wrong thesis

| Horizon | n | `thesis_grade` | `timing_grade` | `sizing_grade` | `risk_management_grade` |
|---|---|---|---|---|---|
| 30 days | 85 | 50 correct, 35 partly, **0 wrong** | 36 good, 14 mixed, 35 poor | 75 good, 10 mixed | 69 good, 13 mixed, 3 poor |
| 90 days | 10 | 0 correct, 10 partly, **0 wrong** | 10 poor | 2 good, 5 mixed, 3 poor | 0 good, 4 mixed, 6 poor |

The 90-day cohort is the honest one, and it is the best evidence this month
that the loop learns. Every August entry and hold is `timing: poor`; risk
management is `poor` on six of ten; the lessons name the actual defects —
"2028 EPS model and premium multiple not independently substantiated",
"demand growth is not fully diluted free cash flow", "did not pre-commit a
factor-wide loss budget". The grader held the evidence cutoff (NBIS's 12 Nov
print is explicitly excluded; VRT is graded on the 10 Nov close "not the
11 Nov rebound"). The last review asked for exactly this.

Three things remain:

1. **Zero `wrong` in 95.** VRT was bought at $296.54 on a model whose weighted
   value has since been cut by a third because the earnings in it could not be
   derived from the business. The grade is `thesis: partly_correct`. The
   schema makes that the natural answer: `thesis_grade` asks whether the
   *operating case* developed as underwritten, and there is no dimension for
   "the valuation was not earned". A wrong price paid for a right company has
   nowhere to go except `timing`. Either add a fifth dimension
   (`valuation_grade`) or state in ritual 12c that an unsupported valuation at
   entry is a thesis failure. Until then the `wrong` column will stay empty
   for a structural reason, and the Phase-1 gate's "is scenario calibration
   credible" cannot be answered from the grades.
2. **The requested operator spot-check has not happened** (no record in the
   November pass). The 90-day cohort is ten rows; reading five takes fifteen
   minutes.
3. **Grades can be written before their horizon exists** (§7.3 P1). A horizon
   is treated as complete from 00:00 UTC on its target date, before that
   session has closed, and `recordDecisionOutcome` does not check elapsed time
   at all. 22 of 95 grades were recorded before anchor + N days had elapsed
   on the clock, 14 of them by 22 hours or more: the five 15 Aug holds were
   graded at 90 days on 12 Nov 01:15 UTC against the 11 Nov close, and nine
   5 Sep holds a calendar day early. Small so far. The sharper failure is a
   slip of the hand: a 30-day grade sent with `horizon_days: 90` is accepted,
   is immutable, and makes the real 90-day grade impossible to record.

Six diagnostics (30 Aug, 3 Sep, 17 Sep, 15 Oct, 24 Oct, 7 Nov) have now
reached the same classification. The mandate's open decision 2 was written
when there were three and asks what the *fourth* must do differently. The
November diagnostics are visibly better than September's — they separate
"no invalidation proven" from "all issuers cleared" and say the absence of
evidence is a limitation — but none states the observation that would make
the next one conclude "thesis failure". That decision is now three diagnostics
overdue.

---

## 4. Software roadmap

### 4.1 Shipped since 13 Oct (11 commits)

| Date | Commit | Kind |
|---|---|---|
| 13 Oct | Record the review; bring plan, runbook and notes up to date; widen the `adj_close` item | docs ×3 |
| 13 Oct | Derive the agent discovery index from the OpenAPI document (`getRiskSnapshot` was missing from it) | **code** (3 files, `apps/web`) |
| 15 Oct | Staged-add rule in the process doc; the same rule in the plugin skill | docs ×2 |
| 3 Nov | Bottom-up valuation required for all companies; gate refined; live valuation identified by heading | docs ×3 |
| 5 Nov | GitHub Actions off the Node 20 action runtime | CI |
| 7 Nov | Ritual 15, pre-event portfolio risk review | docs |

Untracked in the working tree:
`supabase/migrations/20261013120000_revoke_definer_function_execute.sql` and
`supabase/tests/function_access.sql` (the P0 fix, §7.3), and
`update_powerfund_agent_process.py` — a one-shot patcher that inserted ritual
15 and whose embedded text is an *earlier draft* than what was committed (it
still offers `HEDGE` as an outcome). It is spent and should be deleted, not
committed.

### 4.2 Phases

Software Phase 1: the weekly, monthly and event rituals all ran through
PowerFund over MCP — 276 keyed agent writes in 33 days (432 total), 431 of
them `200`. Open from the plan and unchanged: `company_events`, signal inbox
CRUD, the holiday calendar, the runbook's closing steps. Software Phase 2:
unchanged; the replay still waits on membership history (58 membership rows,
no additions this month). Software Phase 3: `getRiskSnapshot` was quoted in
every book-level write this month, with `as_of` — it informs, it does not
gate. The −20% hyperscaler stress predicted −$3.2k to −$3.8k; the realised
factor move cost about $8k from the October level, without a capex guidance
cut. The standing stress is a fundamentals shock and the book has just lived
through a multiple shock roughly twice its size; the stress set needs one.

### 4.3 Closure of 13 Oct items — verified today

Numbering as in the 13 Oct review §7.3 and §11. "Code" means read in the
working tree; "prod" means measured in production today.

| Item | State | Evidence |
|---|---|---|
| **P0** book readable by `anon` via `verify_book_against_ledger()` (§11.1) | **Open in production.** Fix written, untracked | Prod: anon RPC returns 23 rows. Code: migration revokes all seven definer functions correctly and keeps `is_operator()` for `authenticated`; test asserts negative and positive |
| P1 mark at `close`, not `adj_close` (§11.2) | **Open** | Code: all seven level reads unchanged — worker `snapshot/portfolio.ts:203`, `data/portfolio.ts:260`, `api/v1/book.ts:191`, `agent/companies.ts:55`, `data/research.ts:343`, `data/performance.ts:366`, `packages/db/review-triggers.ts:64` |
| P1 unsplice `adj_close` (§11.3) | **Open, recurred** | Prod: a new splice on NVT (factor 1.00165 from 19 Oct, back to 1.0 on the 23 Oct ex-date). SPY/QQQ still carry September's; their December ex-dates (~18 Dec) will add another. Code: ingest compares `close` only; `bars:audit` has no factor check |
| P1 ingest lands 5–7 h late (§11.4) | **Open, worse** | §1.1d. No `pg_cron`, no freshness alert, ADR 0006 not updated |
| P1 `data_completeness` signals (§11.5) | **Open, worse** | Prod: 838 signals, **694** `data_completeness` (83%); 355 written since 13 Oct with spikes of 87, 80 and 82 on 29 Oct, 3 Nov and 5 Nov; every one still status `new`. No `scorer_runs` |
| P1 holiday calendar (§11.9) | **Open; first test in 11 days** | Code: `dates.ts:90` "Weekends only". §7.3 traces 26–27 Nov |
| P2 `knowable_at` after `observed_at` (§11.7) | **Open, growing** | Prod: 27 of 178 estimated vintages (21 of 161) |
| P2 dossier status follows the book (§11.6) | **Open** | Prod: 8 of 11 held dossiers `investigate` |
| P2 no dividend booking path | **Open** | Code: writers are buy, sell, deposit, withdrawal, adjustment. NVT went ex-dividend 23 Oct; VST and CEG pay |
| P2 grants page; revoke the preview grant (§11.8) | **Open, and the grant is in use** | Prod: the Deploy Preview refresh-token family has rotated 15 times, most recently **6 Nov**, and now expires 6 Dec. The last review recorded it as never used. Something still connects to the preview (read-only, resource-bound — harmless, and unexplained) |
| P2 `documents` / `company_events` | **Open** | Prod: 0 rows |
| P2 `price_basis` | **Open** | — |
| P3 per-instance rate limit | **Open** | Code: module-scope `Map` |
| P3 `transactions_append_only` search_path; leaked-password protection | **Open** | Not in the untracked migration, where it could have ridden along |
| P3 docs (§11.10) | **Partly** | Plan and runbook were brought to 13 Oct that day and not touched since; §7.4 |
| MCP open item 1 — unknown-outcome writes | **Open, and it has now happened** | Prod: one key pinned at `-2` (`updateReviewTask`, 25 Oct 11:10 UTC). The pin worked as designed; nothing records whether the write landed |
| MCP open items 2, 4–6 | Open, low | — |
| §11 process: pre-print numbers in task `instructions` | **Not verified** | Not sampled this review |
| §11 process: publish the 90-day distribution; spot-check five | **Half** | Distribution is in §3.6 here; no spot-check recorded |
| §11 process: pick N for the relative-return clause on 1 Nov | **Not done** | Mandate "Open mandate decisions" unchanged; second monthly pass to skip it |
| §11 process: back up the published GPT instructions before 11 Dec | **Not done** | Runbook phase I still owed; 26 days left |
| Benchmark TR understated (§1.1b) | **Open** | The stored SPY series returns −2.35% since 12 Aug adjusted and −2.34% unadjusted — i.e. still price-only. True TR is ~0.25 pp higher, so relative numbers above flatter the sleeve by that much |

Nothing closed. One item (the leak) moved from "found" to "fix written".

---

## 5. What we are doing well

1. **Behaviour under stress matched the mandate.** A 36% sleeve drawdown
   produced three diagnostics, eleven-name weekly holds, a refusal to trim on
   price and a refusal to average into the factor. The Phase-1 "volatility"
   proof — reassessment, not panic — now has real evidence behind it, which
   it did not a month ago.
2. **The valuation gate caught a live error before money moved.** The $1,000
   VRT staged add queued on 31 Oct at "below $235" was deferred on 3 Nov when
   the bottom-up rebuild cut the model; VRT closed at $202 on 13 Nov. One
   rule, three days old, stopped a tranche into a further 14% decline.
3. **The 90-day grades are harsh where they should be** (§3.6) and respect
   the evidence cutoff. This was the open question of the last review.
4. **The record refuses flattering readings.** NAV-versus-QQQ is positive and
   the reviews decline to claim it; the diagnostics separate "no invalidation
   proven" from "cleared"; the emergency review is labelled as written *after*
   the shock and "not misrepresented as a pre-event forecast".
5. **The measurement layer held through the worst month.** 67 snapshots, no
   alignment issues, ledger to the cent, guards armed, 276 agent writes with
   one pinned-unknown and no double write.
6. **The agent reports tool defects in its outcomes.** Two reviews noted
   `get_performance` returning `price_data_stale: true` while portfolio and
   risk were fresh, and declined to rank on it. That is a bug report from the
   primary user (§7.3 P2).
7. **Review items still close each other.** Nothing in this review was
   rediscovered; every carried item was found where the last review left it.

## 6. The agent operating process — assessment of the month's changes

The operator asked for a specific assessment of
[gpt-agent-process.md](../gpt-agent-process.md). Three substantive rules were
added: the staged-add rule (15 Oct), the valuation underwriting gate (3 Nov,
three commits) and ritual 15, the pre-event portfolio risk review (7 Nov).
Each is assessed on design, on evidence from production, and on what it costs.

### 6.1 Summary judgement

| Rule | Design | Evidence so far | Verdict |
|---|---|---|---|
| Valuation underwriting gate | Strong. Separates economic underwriting from arithmetic QA; reprice-vs-re-underwrite keeps it affordable; "no grandfathering" | Deferred the VRT add; exposed that no held model is decision-grade | **Keep. The most valuable change since the sell path.** Needs a stored object and an adoption deadline |
| Ritual 15, pre-event risk | Careful: ex-ante timestamp, probability ≠ reaction, strict reduce bar, no hedging without a mandate change | One on-time memo (NVDA, T−7). Its only practical output today is the stance already in force | **Keep, but it is a record, not yet a control.** Fix the choice set (§6.3) |
| Staged-add rule | Coherent in itself; good primary/secondary test | Premise falsified within a month: CRDO, the name it was written about, is −39% since. First use (MRCY) coincided with its own adoption | **Keep on probation.** Subordinate to the valuation gate explicitly; no new use until the quarterly reads it |

Overall: the document is better at preventing the specific mistakes of August
than it was a month ago, and it has become harder to follow, harder to verify
and entirely unenforced. The direction is right; the method of change is the
risk.

### 6.2 Valuation underwriting gate

**What is good.** It names the actual August failure: "a coherent EPS × P/E
table whose earnings and multiples had not been justified from operations".
The six checks are the right six. The distinction between a *reprice* (new
close, same model) and a *re-underwrite* (new model) is what makes the gate
survivable — without it every weekly hold becomes a research project. The
explicit status (`DECISION-GRADE` / `PROVISIONAL`), independent of
`research_level`, is correct, and "an unsupported estimate does not by itself
order a sell" prevents the gate from becoming a liquidation trigger.

**What production shows.**

- 7 of 11 held dossiers have the block; all `PROVISIONAL`. CEG, KTOS, MRCY and
  VST have none. MRCY is the sharpest case: money was added on 15 Oct and the
  dossier was re-underwritten after its 10 Nov print *without* the block the
  gate has required since 3 Nov.
- Across the other 45 dossiers, 2 have the block.
- Six held dossiers carry both the new `### Valuation —` block and the older
  `## Valuation scenarios` heading. The rule is "one live Valuation heading";
  whether the old one is labelled superseded was not checked line by line.
- `research_level` contradicts the status on three names: VRT is
  `investment_ready` with a `PROVISIONAL` valuation; CEG and NOC are
  `investment_ready` with no valuation block. The document anticipates this
  ("legacy statuses must be audited"); the audit has not reached them.
- The "one-time audit" was to be documented in the next monthly pass. The
  3 Nov pass did start it (VRT rebuilt; five names marked provisional). It
  did not produce the backlog as a list with an order and dates.

**Gaps.**

1. **Nothing enforces or even parses it.** The status is a bold string inside
   a prose field, found by a heading convention. `createPlannedAction` for a
   `buy` does not look for it. The document says so ("interim safeguard, not
   a replacement for a validated data structure") and asks for the structured
   object; `plan.md` item 11 has carried that since 3 September. Ten weeks on,
   the highest-value software item in the project is still a paragraph.
2. **It is not in the plugin skill.** `SKILL.md` gained the staged-add rule on
   15 Oct "so MCP agents see it among the hard rules rather than only in the
   bundled process doc", and gained ritual 15 on 7 Nov. The valuation gate —
   the one that blocks capital — is not among the skill's hard rules at all.
3. **The hurdle is undefined.** The gate (rightly) refuses to invent a fixed
   12% or 15% and says a universal hurdle needs a mandate decision. But the
   staged-add rule, ritual 9 and the VRT deferral all turn on "clears the
   hurdle" — VRT at 12.3% to the weighted endpoint was judged not to. A
   decision is being made against a number nobody has written down. This is a
   fifth open mandate decision.
4. **No path back to `DECISION-GRADE` has been walked.** Until one model
   passes all six checks, nobody knows what a pass costs in hours or whether
   the bar is reachable for a name like NBIS or SNDK. Pick the easiest
   candidate (ISRG or CEG) and take it through end to end before the December
   pass.
5. **It halts deployment by side effect** (§3.4).

### 6.3 Ritual 15 and the staged-add rule

**Ritual 15 — what is good.** It demands the decision *before* the event
with a timestamp, separates the probability of an outcome from the market's
reaction to it, sets a deliberately high bar for a pre-emptive trim, forbids
hedges the mandate has not authorised, and keeps post-event observation
inside existing tasks instead of spawning three more. The materiality screen
was tightened between draft and commit (the untracked script still shows the
looser version), which is the right direction. The NVDA memo followed the
timing exactly: discovered T−10, decided T−7, scenarios in dollars.

**Ritual 15 — what is weak.**

1. **Its choice set has one live option.** `REDUCE` requires an existing
   per-name trigger, a documented impairment path, or a cap or risk-budget
   problem. No cap can bind — the caps are 10% and 40% of NAV and the whole
   sleeve is 12%. `DEFER NEW RISK` has been the standing stance since 15 Oct.
   So the NVDA memo's 9,000 characters concluded what was already true. The
   ritual currently produces a well-argued record and a calibration baseline;
   it does not produce a decision that could have come out differently.
   Either accept that and say so (it is a *pre-mortem*, valuable as one), or
   give it a real lever: a sleeve-level risk budget — a dollar or percentage
   loss on the deployed sleeve that the book pre-commits to — which `REDUCE`
   can be tested against. The 90-day lessons ask for exactly this ("did not
   pre-commit a factor-wide loss budget").
2. **The materiality thresholds do not scale with the book.** "≥1% of NAV or
   ≥10% of the deployed sleeve" are nearly the same number today ($2.4k and
   $3.0k), and the sleeve moved more than 10% in two sessions twice this
   month. Every AI-factor event clears the bar; the standing −20% stress alone
   is 1.3% of NAV. In practice the screen is "anything touching AI capex",
   which contradicts the same paragraph's "recurring clustered earnings weeks
   normally receive a lightweight assessment".
3. **Unscheduled shocks have no home.** The 13 Nov write is titled "Emergency
   portfolio risk" and describes itself as a "Ritual 11/15 equivalent". The
   cadence table gives ritual 11 "major factor shock" and ritual 15 says "for
   sudden events, act immediately", but the taxonomy has a title pattern and
   a persistence rule for neither. Add one row.
4. **It was written after the event it is about.** The election had a macro
   task dated the day *after* the vote. That is why the ritual exists, and it
   is fine — but it is the third rule in a row with this origin (below).

**Staged-add rule.** Internally it is well built: the "would a bad answer
break the base case" test for primary versus secondary risk is a usable
discriminator, "never reclassify a question as secondary to make a name
eligible" closes the obvious loophole, and the reserve "is not a commitment".
The problems are around it:

1. **Its provenance did not survive the month.** The rule was derived from one
   30-day grade on CRDO — "thesis correct, timing poor" because no second
   tranche was taken on a dislocation. CRDO has since fallen 39%. The tranche
   the rule regrets not buying would have lost more than a third. This does
   not prove the rule wrong; it proves that one 30-day grade on one name in a
   correlated cohort is not enough to change a rule, which is what `plan.md`
   said about that cohort when it was graded.
2. **It bypassed the process's own change procedure.** Ritual 12g says a
   repeated pattern should be written as a proposed change in the quarterly
   outcome "for the operator to adopt into this document". This was one
   observation, mid-quarter, adopted the same day it was first used (§3.5).
3. **Without the valuation gate it would have deployed into the drawdown.**
   The VRT add was queued as `case3_staged_add`. What stopped it was the
   gate added three days later. The rule's Q1 ("has intrinsic value stayed
   roughly intact?") was answered yes on 31 Oct from a model that was cut by
   a third on 2 Nov. Q1 needs to read "…per a `DECISION-GRADE` model"; as
   written, a provisional table can satisfy it.

### 6.4 The document as a whole

1. **Rules are being added one loss at a time.** VRT's table → underwriting
   gate. CRDO's missed add → staged adds. The election → ritual 15. Each is a
   reasonable response; together they are a process being fitted to its last
   three errors, on a sample the project's own notes call too small and too
   correlated to tune a *scorer* against. The same discipline should apply to
   the rulebook: every rule change should record its provenance, what
   observation would show it was wrong, and a date on which it is re-read.
   The staged-add rule has the first, the second in 12g, and not the third.
2. **Size.** 1,273 lines and ~113 KB, read by a language model before it acts.
   The hard-rules block alone is 14 bullets, several of them paragraphs.
   Nothing measures whether a rule on line 400 is followed as reliably as one
   on line 10, and §6.2 shows a hard rule (the valuation block) missed on 4 of
   11 holdings twelve days after adoption. `evals/mcp/` has cases and a
   results template and no recorded results; no case covers any of the three
   new rules.
3. **Internal defects found on a straight read.**
   - The opening paragraph still says "paste this file into custom
     instructions". It has not fitted in custom instructions for months and
     the agent has been on MCP since 1 October.
   - Ritual 8 numbers its checklist 1–7 and then "Entry staging" opens with a
     second step 7.
   - Ritual 15's hard-rule summary lists three outcomes; the untracked patcher
     that wrote it lists four (`HEDGE`). The committed text is right; the
     script should go.
   - "Hurdle" is used in rituals 8, 9 and the staged-add cases and defined
     nowhere (§6.2).
   - The stress classification in ritual 11 step 5 ("valuation shock, theses
     intact → hold; consider acceleration per the ladder") now collides with
     the underwriting gate: acceleration needs a decision-grade model, and
     there are none. Say which wins.
4. **Distribution is unverified.** `plugins/powerfund/build.sh` copies the
   process doc into the plugin at build time. The only build in the working
   tree (`plugins/dist/`, git-ignored) is dated 1 October and differs from
   today's document and skill. The agent's November writes use the new
   vocabulary (`case3_staged_add`, "Pre-event portfolio risk", the valuation
   block), so it is reading a current copy from somewhere — but the runbook's
   phase F still says the skill was "last kept current 7 Oct", and nothing in
   the repo records which build is installed. A rule change is not adopted
   until the installed plugin carries it; record the build date in the runbook
   each time.
5. **Prose is standing in for software in six places, each acknowledged in the
   text:** valuation status and model (no field), `technical_state` (no
   field), ritual-15 materiality and dedup (title convention), the roll-forward
   of monthly and quarterly tasks (agent must remember), the staged-add
   reserve (rationale text), and the evidence cutoff on grades (ritual 12b:
   "nothing in the schema can enforce this"). Each is a place where the
   record's integrity depends on a model reading 113 KB correctly every time.

### 6.5 Recommendations for the document

In priority order; the first four are edits, not software.

1. Add the valuation underwriting gate to `SKILL.md`'s hard rules, and make
   staged-add Q1 require a `DECISION-GRADE` model.
2. Add a **change log** section at the foot: date, rule, provenance, falsifier,
   review date. Backfill the three rules of this month. Route future changes
   through the quarterly outcome as 12g already says; allow an emergency
   change only with an explicit "adopted outside cadence because …" entry.
3. Give ritual 15 either a risk budget to test `REDUCE` against, or an honest
   label as a pre-mortem. Rescale the materiality screen to something that
   does not fire on every AI event while the sleeve is 12% of NAV.
4. Fix the five internal defects in §6.4.3; add the unscheduled-shock row.
5. Split the file: a short always-loaded core (hard rules, cadence, taxonomy,
   ~250 lines) and one reference file per gate and ritual, loaded when that
   ritual runs. The plugin already has a `references/` mechanism.
6. Write eval cases for the three new rules (a provisional model must refuse a
   buy; a ritual-15 task must be dated before its event; a case-3 add must
   name its reserve gate) and record results — once before the split and once
   after, so the split is measured rather than assumed.

---

## 7. Gaps, inconsistencies, bugs, unaccounted risks

### 7.1 Process inconsistencies

| Finding | Why it matters |
|---|---|
| No decision-grade valuation on any name; four holdings lack the block | §6.2. The gate's own audit is twelve days old with no dated backlog |
| Deployment halted by research backlog, not by a recorded capital decision | §3.4 |
| Rule 5 reinterpreted and used in one session (MRCY) | §3.5, §6.3 |
| 95 grades, 0 `wrong`; no valuation dimension | §3.6 |
| Six identical diagnostics; no stated falsifier | §3.6; mandate open decision 2 |
| Weekly review slipped to ten days a third time (24 Oct → 3 Nov) | Still measured as an apology rather than a count on the monthly pass |
| VST dossier unverified since 5 Sep; KTOS has no `next_review_at`; 11 dossiers past `next_review_at` (0 a month ago) | Research hygiene slipped under drawdown load |
| Calendar thinning: 24 pending, 2 beyond December | The Saturday refresh is not keeping "2–3 months ahead" |
| Two `add` journal rows for one fill | §3.5 |
| 8 of 11 held dossiers `investigate` | Carried |
| Mandate open decisions unchanged since 19 Sep; "pick N" skipped twice | Carried; now with a fifth (the hurdle) |
| Operator spot-check of grades not done | Carried |

### 7.2 Mandate vs code

| Rule | Doc | Code |
|---|---|---|
| Kill-switch 15% | Diagnostic in Phase 1 | Matches; fired and re-opened correctly three times. Reads a true series today; §7.3 P1 threatens that series in December |
| Max position, theme, AI-capex caps | 10% / 40% / 40% of NAV | Enforced; **cannot bind** while the sleeve is 12% of NAV. Every hard limit in the mandate was satisfied throughout a 36% sleeve drawdown |
| Rule 5, no averaging down on price alone | Mandate text unchanged | Not encoded. The process doc now defines when existing evidence plus a dislocation suffices; the mandate does not mention staged adds |
| Valuation underwriting before `buy`/`add` | Process doc hard rule | Not encoded; no field |
| Pre-event risk decision | Mandate row added 7 Nov | Not encoded; title convention |
| Benchmarks total-return | Required | Still price-only across ex-dates |
| Dividends | NAV = cash + marked stocks | No booking path; NVT, VST and CEG have paid or gone ex since entry |
| Relative return | Reported | No rule reads it; −24.4 pp vs SPY |

### 7.3 Coding and data bugs

New findings are marked **new**. "Inferred" means read in code, not reproduced.

| Sev | Area | Issue |
|---|---|---|
| **P0** | Access control | Carried, **still live**. `verify_book_against_ledger()` is executable by `anon`; 23 rows returned today. Commit the two untracked files, `db reset`, run the suite through `psql -v ON_ERROR_STOP=1`, `db push`, re-test with the anon key. Two notes on the fix as written: it does not alter default privileges (it cannot — the built-in `PUBLIC` grant is not removable per schema), so the `pg_proc` test is the only guard for the next definer function; and the test's `set local role supabase_auth_admin` has not been run locally, so confirm it passes before relying on it |
| **P1** | Unpaged bar reads | **New, inferred.** Three reads fetch all bars for many instruments in one request with no `.range()`, ordered ascending, so the cap cuts the newest sessions. (1) `lib/data/decision-returns.ts:187` — 14 ids, 938 rows today, over 1,000 on **20 Nov**: horizon returns then end at the cut-off bar while `complete` is still computed from today, and newly anchored holds resolve to `no_session` and drop out of the grading worklist without an error. (2) `snapshot/portfolio.ts:166` — 737 rows, over 1,000 at session 91 (~18 Dec; ~10 Dec with a twelfth name): the newest sessions are marked at carried-forward closes, declared `staleMarks`, exempted by `snapshotAlignmentIssues`, and the nightly job rewrites the series green. (3) `lib/data/contribution.ts:104` — same shape. Page all three (ingest's `storedCloses` already shows how); assert that the marks loaded for the last session equal the open-position count; reproduce with a fixture of 14 instruments × 100 sessions |
| **P1** | Calibration | **New.** `recordDecisionOutcome` (`lib/journal/record-outcome.ts`) accepts any of 30/90/180 for any decision without checking the horizon has elapsed, and `decisionHorizonReturns` marks a horizon complete when the calendar date reaches the target, before that session's close exists. A grade sent with the wrong `horizon_days` is immutable and permanently consumes the slot (`HORIZON_ALREADY_GRADED` thereafter). 22 of 95 grades predate their horizon on the clock. Refuse a clocked grade whose target session has no stored bar; echo the cutoff date in the response |
| **P1** | Ingest | **New.** `apps/worker/src/index.ts`, case `"bars"`: `process.exitCode` is set only when scoring fails, never when `bars.failed.length > 0` (case `"all"` does set it). The scheduled job can go green with every symbol failed — a third instance of "a green ingest is not evidence the store is current". `bars:freshness` likewise never fails the run, so a store still behind after the 05:07 retry is also green |
| **P1** | Prices | Carried. `adj_close ?? close` as a level in seven places; splice now on NVT as well |
| **P1** | Scheduling | Carried, worse. +7h35 to +7h52 daily in November; 23 manual dispatches |
| **P1** | Signals | Carried, worse. 694 of 838 |
| **P1** | Calendar | Carried, **due 26 Nov**. Inferred trace: on Fri 27 Nov the clock expects a 26 Nov session; `bars:freshness` reports stale; the retry re-ingests for nothing; the scorer marks every name stale and writes a `data_completeness` signal per complete name, then a second batch when they flip back — roughly 80 rows per holiday, the Labor Day pattern. `price_data_stale` reads true to the agent from Thursday 16:00 ET until Saturday's ingest, i.e. through the Friday half-day. Christmas (Fri 25 Dec) and New Year (Fri 1 Jan) repeat it and last until the following Tuesday because nothing runs Sunday or Monday. The snapshot itself is safe: it keys on SPY's bars |
| P2 | Agent API | **New, reported by the agent, not yet diagnosed.** `getPerformance` returned `price_data_stale: true` on 10 Nov and 13 Nov while `getPortfolio` and `getRiskSnapshot`, built seconds apart, said fresh. `toAgentPerformance` derives `through` from `contribution.end` and tests it against `windowTo ?? asOf`, a different pair from the other two endpoints. Reproduce with the 13 Nov inputs and make the three agree by construction |
| P2 | Idempotency | Carried as MCP open item 1; first live instance (`updateReviewTask`, 25 Oct, pinned `-2`). Confirm by hand whether that write landed |
| P2 | OAuth | Carried, changed. The preview grant is being refreshed (last 6 Nov). Find the client, then revoke by SQL |
| P2 | Journal | **New.** A queued add confirmed through the UI writes a second decision row beside the agent's intent row (§3.5); `planned_actions.decision_id` exists and could carry the link |
| P2 | Vintages | Carried. 27 dated after their own observation |
| P2 | Dossiers | Carried. Status does not follow the book |
| P2 | Book | Carried. No dividend path |
| P2 | `documents` / `company_events`; `price_basis` | Carried |
| P3 | Worker | **New.** `netlify/functions/ingest-bars-background.ts` runs ingest → snapshot → score with no review latch and no `verify:book`; it has drifted from the workflow it mirrors |
| P3 | Scorer | One setup `stale` as of 13 Nov with the store current (0 a month ago); not investigated |
| P3 | Rate limit; `transactions_append_only` search_path; leaked-password protection | Carried |
| P3 | Repo | `update_powerfund_agent_process.py` at the root: spent, untracked, embeds a superseded draft. Delete |

Further new findings from the code read, all verified in code and none yet
observed in production:

| Sev | Area | Issue |
|---|---|---|
| P2 → P1 at the first sale | Performance | `dailyReturn` in `packages/domain/src/performance.ts:165` is `end / (start + flow) − 1`. Correct for a buy; for a sell the negative flow removes proceeds from the base, so the day's return is computed on the remainder only. A trim that is flat on the day is unaffected; one executed away from the prior close is distorted in proportion to its share of the sleeve (sleeve 10,000, sell a 9,000 block for 9,600, remainder flat: +150% instead of +6%), and a full liquidation makes the denominator ≤ 0, so the day is dropped from the index and from the drawdown the kill-switch reads. No sale has been booked and no test has a negative sleeve flow. Fix before the sell path is first used — the last review's "untested against money" now has a specific defect behind it |
| P2 | Idempotency | `lib/api/agent/http.ts:227` pins the key as outcome-unknown on **any** throw, and the routes throw their 422/404/409s (`validationError`, `notFound`, `MANDATE_BLOCKED`, the source-link refusal). MCP keys are derived from the arguments, so a refused call retried unchanged after the cause is fixed — `update_dossier` after adding the missing symbol, `create_planned_action` after a deposit — is refused for an hour as "may or may not have written" though nothing was. The one pinned key in production (25 Oct) may be this rather than a real unknown. Distinguish refusals thrown before any write from genuine unknowns |
| P2 | Review triggers | The latch evaluates a `price` condition against the newest stored close only (`packages/db/src/review-triggers.ts:48`). When a run stores two sessions at once — a missed night, a holiday, a late scheduler — a level crossed on the first and recovered on the second never fires. This is the case the latch exists for. Evaluate every session stored since the last latch |
| P2 | Process enforcement | What the server checks of the process gates: the source-link rule (only when `source` changes) and `expected_version`. Nothing else — not approval, not the dossier revision gate (an `updateDossier` that blanks `risks` is accepted), not valuation status, not ritual-15 timing, not staged-add size. §6.4.5 |
| P3 | Queue UI | `lib/actions/planned-actions.ts:99` changes status by id with no check on the current status; a form post can move a **confirmed** action back to `pending` or `cancelled`. The agent path refuses this. No money moves (re-confirm hits the `alreadyBooked` repair), but that repair restores only `status` |
| P3 | Validation | `new Date(raw).toISOString()` throws `RangeError` before the `isNaN` check in six action files (`create-decision.ts:101`, `planned-actions.ts:169`, `positions.ts:70`, `sell-position.ts:230`, `cash-entry.ts:87`, `decisions.ts:55`); through the agent API a bad `action_at` is a 500 that also pins its key |
| P3 | Planned actions | `mandate_override_reason` on `updatePlannedAction` passes the gate and is then discarded (`mutate.ts:343`); create stores it, update does not |
| P3 | Journal paging | `getJournal`'s cursor is the last row's `action_at` with a strict `<`; a batch of holds sharing one timestamp across a page boundary loses its tail |

Checked this month and found sound: the ledger trigger and both booking
idempotency paths (cash row locked, full exit zeroes basis, a double-submitted
confirm fails on the unique index); the direction-aware gate including revival
to `pending`; the derived discovery index (22 operations matching routes
one-to-one, all classified in `exposure.ts`); the idempotency reservation and
OAuth refresh-reuse handling; the ingest rebase guard, whose `storedCloses`
read *is* paged.

### 7.4 Docs drift

| File | Stale statement |
|---|---|
| Root `README.md` | Layout says `netlify/functions` is "Scheduled + background EOD ingest" (scheduling is GitHub Actions, as the same file says 60 lines later); worker described as "bars + fundamentals"; omits `plugins/`, `evals/`, SEC and Stooq; "Node 20+" (everything runs 22); `db:test` described as two suites (there are ten, eleven with the untracked one); Status paragraph predates the book, the queue, the agent API and MCP |
| `docs/deploy.md` | Fundamentals "Sundays at 08:00 UTC" (cron is 08:37); says docs-only pushes skip the Netlify build (`netlify.toml` includes `docs`, so they deploy — relevant because every process-doc commit this month was a production deploy); omits `verify:book` and the measured lateness |
| `docs/plan.md` | Counts dated 13 Oct; "first 90-day grades fall due around 10 Nov" is now past; the near-term list has **no items** for the leak, the `adj_close` splice or the scheduler; item 11 (stored scenario object) does not mention that a process gate now depends on it |
| `docs/gpt-to-plugin-migration.md` | "Where this stands (13 October)"; phase F "last 7 Oct" though the skill changed 15 Oct and 7 Nov; phases G, I, J still owed |
| `docs/mcp-tools.md`, `docs/mcp-architecture.md` | "22 tools" / "21 operations" (23 and 22 + index) |
| `CLAUDE.md` | "408 of 483 live signals" (694 of 838); layout calls `packages/db` "generated Supabase types" though it holds the review-trigger latch |
| `architecture/decisions/0006` | Still named for Netlify; carries the old lateness figure |

### 7.5 Risks not in the mandate

| Risk | Note |
|---|---|
| **The book is readable with a public key** | A month old. §11 item 1 |
| **Sleeve-level loss has no limit** | Every cap is a share of NAV; with 88% cash none can bind. The 15% line is a diagnostic. The book has no number at which the *sleeve* must shrink, and ritual 15 has nothing to test a reduction against. This is the largest gap the month exposed, and it is a mandate decision, not a software one |
| Process fitted to recent losses | §6.4.1 |
| Rules the server cannot check | §6.4.5 |
| Self-graded calibration, structurally unable to say `wrong` on valuation | §3.6 |
| Multiple compression is not in the stress set | §4.2 |
| GPT retirement 11 Dec | Published-instruction backup still not taken; 26 days |
| NAV series integrity in December | §7.3 P1 snapshot paging, plus the SPY/QQQ ex-dividend splice due the same week |
| Coinbase commingling, viewer accounts, public book | Unchanged |

---

## 8. Architecture gaps

Ordered by how much they block a ritual or an invariant.

1. **No stored valuation model.** Carried since 3 September as "the largest
   remaining gap"; now load-bearing. A `valuation_models` table — instrument,
   version, status, as-of, share basis, scenario rows (case, weight, EPS, FCF,
   multiple, value, horizon), evidence cutoff, supersedes — would let the app
   reprice every model nightly, let `createPlannedAction` refuse a `buy`
   against a provisional one, make "scenario calibration credible" checkable,
   and delete about 150 lines of the process document.
2. **No sleeve risk budget, and nothing between "diagnose" and "invalidate".**
   §7.5. Software can only encode it once the mandate states it.
3. **No function-level access guard in CI.** Written; uncommitted.
4. **Unpaged reads in the worker.** One is on a timer (§7.3). Audit every
   `from("market_bars")` in `apps/worker` and `apps/web/src/lib/data` for a
   missing `.range()`; the store grows by ~60 rows per session.
5. **Exit codes do not mean success.** `bars`, `bars:freshness` and the
   scheduler all report green over a failed or stale state. One rule: the job
   fails if the store does not reach the expected session after the retry.
6. **The scheduler is not ours and the operator is the retry.** Carried.
7. **Adjusted and unadjusted prices share a column's semantics.** Carried.
8. **Pipeline health lives in `signals`.** Carried; the inbox is 83% noise and
   has never had a row moved out of `new`.
9. **Weekday-only trading calendar.** Carried; due.
10. **No event source.** Carried. Ritual 15 raises the stake: the pre-event
    gate can only fire for events the Saturday sweep happened to find.
11. **Process text has no change control and no installed-version record.**
    §6.4.

## 9. Model and logic gaps

- **Grades cannot express a valuation error** (§3.6). One enum.
- **The stress set is one fundamentals shock.** Add a multiple-compression
  path (no guidance cut, factor multiple −30%) beside the capex −20% stress;
  ritual 15 check 4 already asks the agent to improvise one each time.
- **Correlation is measured, not used.** NVT–VRT 0.75 and CEG–VST 0.81 were
  quoted in five writes this month and changed no size. Plan item 19.
- **No stored priors at entry** (plan item 17). The 90-day lessons are each
  reconstructing what the entry "should have" stressed; with the numbers
  written at entry the grade would be a comparison.
- **`technical_state` still lives in ranking prose.** Carried; the first use
  in a planned action is the VRT `window_label`
  (`confirm:stabilization_or_higher_low`).
- **Scorer evaluation waits on history** — unchanged and correct.
  `fundamental_inflection_v1` stays shadow; 24 of 56 setups now read
  `correction_candidate`, which after a 30% factor drawdown says more about
  the scorer's price term than about the companies.
- **Position sizing is dollar-fixed** — carried; plan item 18.

---

## 10. Tests

695 tests in 72 files (694/72 on 13 Oct); typecheck clean. One test was added
in the month, for the derived discovery index. None of the tests the last
review listed as missing has been written; the one that was written
(`function_access.sql`) is untracked. `apps/worker` still has no in-package
tests, and two of this review's P1s live there.

Missing, each a finding above:

- **The function-access suite, committed** — it exists and CI has never run it.
- **Paging:** 14 instruments × 100 sessions through the snapshot, the
  decision-returns loader and contribution; the last session's marks must
  come from that session. An invariant over stored data to match: every
  snapshot's mark count equals its open-position count, and `staleMarks` on
  the newest session is a failure, not an exemption.
- **A sell-day sleeve return:** a negative sleeve flow, partial and full, in
  `performance-math.test.ts`.
- **A thrown 4xx frees or replays its idempotency key; a thrown 5xx pins it.**
- **A price condition crossed on the first of two newly stored sessions fires.**
- **`bars` exits non-zero when any symbol fails; the scheduled job fails when
  the store is behind after the retry.**
- **A clocked grade is refused before its target session has a bar.**
- **`getPerformance`, `getPortfolio` and `getRiskSnapshot` agree on
  `price_data_stale` for the same instant** — fixture from 13 Nov 04:30 UTC.
- **A confirmed queued add yields one journal row, not two.**
- Carried: `close / adj_close` non-increasing with date; a snapshot marks at
  `close`; `knowable_at <= observed_at`; a scorer run that changed only
  `stale`/`completeness` writes no signal; `lastCompletedCashSession` on a US
  holiday returns the previous session.
- **Process evals** (§6.5.6): three cases for the three new rules, with
  results recorded in `evals/mcp/results/`, which still does not exist.

---

## 11. The next month (15 November – 15 December)

Fixed dates that frame it: NVDA Q3 **17 Nov** (pre-event decision already
written); Thanksgiving **26 Nov** and the 27 Nov half-day; monthly pass
**1 Dec**; Texas/ERCOT pre-event deadline **3 Dec**; GPT retirement
**11 Dec**; SPY/QQQ ex-dividend and the snapshot paging cliff **~18 Dec**.

The month's rule: **no further additions to the process document until items
1–6 below have shipped.** The process is ahead of the software by a month;
this month the software catches up.

### Week 1 (15–21 Nov) — close what is already written, defuse what is dated

1. **Close the book leak.** Commit the untracked migration and test, add the
   `transactions_append_only` search_path to the same migration, `db reset`,
   run the suite, `db push`, confirm the anon RPC now fails. Half a day.
   Delete `update_powerfund_agent_process.py`.
2. **Page the three bar reads** — decision returns first, it crosses the cap
   on 20 Nov — with the fixture and the mark-count invariant. Add the
   grade-write guard in the same change, before the next grading run.
3. **Make failure red.** `bars` sets a non-zero exit when any symbol fails;
   the scheduled job fails when the store is behind after the retry.
4. **Holiday calendar** in `packages/domain`: SPY's stored bars for the past,
   a static NYSE list (with early closes) forward. Must be live before 26 Nov.
5. **Stop writing `data_completeness` signals**; add `scorer_runs`; delete the
   694 rows by migration. Do it with item 4 so Thanksgiving writes none.

### Week 2 (22–28 Nov) — prices and the clock

6. **Mark at `close`** in the seven level reads; rebuild snapshots; confirm
   NAV history moves by cents and `alignmentIssues` stays empty.
7. **Unsplice `adj_close`**: factor-change detection in `ingestBars`, the
   monotonic check in `bars:audit`, one full refetch of SPY, QQQ and the
   eleven holdings. Must land before the December ex-dates.
8. **Put the ingest on a clock that keeps time**: `pg_cron` → `pg_net` →
   `workflow_dispatch` at 03:07 UTC, GitHub's schedule as fallback, the
   measured lateness recorded in ADR 0006. Success is zero manual dispatches
   in the following fortnight.
9. **Sell-day return maths** in `performance.ts`, with tests, before any
   sale is booked; the `getPerformance` staleness reproduction; thrown 4xx
   no longer pins an idempotency key; the latch evaluates every newly stored
   session.

### Weeks 3–4 (29 Nov – 15 Dec) — give the valuation gate an object

10. **`valuation_models`** (§8.1), smallest useful version: table, an agent
    operation to write and read a model, exposure classification and MCP tool,
    regenerated catalog. `createPlannedAction` for `buy`/`add` returns a
    warning — not yet a refusal — when the latest model is not
    `DECISION-GRADE`. Nightly reprice can wait a sprint; the stored status
    cannot.
11. **Dossier status follows the book**; one journal row per confirmed add;
    `knowable_at` fix with its assertion.
12. **Revoke the preview grant** once its user is identified; back up the
    published GPT instructions (runbook phase I) **before 11 Dec**; record the
    installed plugin's build date in the runbook.
13. **Docs**: root `README.md`, `deploy.md`, `plan.md` near-term list (add
    the items above), runbook status, the two MCP counts.

### Process, not code

- **Process-document maintenance only** (§6.5 items 1–4): the skill gains the
  valuation gate; staged-add Q1 requires a decision-grade model; a change log
  with provenance, falsifier and review date; the internal defects fixed. No
  new rules.
- **Take one model to `DECISION-GRADE` before 1 Dec** — ISRG or CEG — and
  record how long it took. Add the valuation block to CEG, KTOS, MRCY and VST
  even where the status is `PROVISIONAL`. Bring VST and KTOS up to their Q3
  prints.
- **The 1 December pass must contain**: the valuation backlog as a dated list;
  an explicit capital decision on deployment while that backlog is open; the
  weekly-cadence count for November; the grade distribution by horizon with a
  sentence on the empty `wrong` column; and the operator's spot-check of five
  90-day grades.
- **After 17 Nov**, compare the NVDA pre-event scenarios with what happened,
  inside the existing event-day task. This is ritual 15's first calibration
  point; it decides whether the ritual stays a pre-mortem or earns a lever.
- **Refill the calendar** to February, including the Q4 print windows.
- **Run and record the MCP evals**, with three new cases, before and after any
  restructuring of the document.

### For the mandate (operator decisions)

Four are unchanged since 19 September; the drawdown made three of them
urgent and added two.

1. **A sleeve-level risk budget** — the loss on deployed capital at which the
   sleeve must shrink or stop growing, independent of per-name invalidation.
   New, and the most important.
2. **The return hurdle** that "clears the hurdle" refers to, or an explicit
   statement of how it is set per name. New.
3. Whether the Phase-1 → 2 transition requires a relative-return proof, and N.
   At −24 pp this is no longer abstract.
4. What the next identical diagnostic must do differently — the falsifier.
   Six diagnostics in.
5. Whether staged adds amend rule 5, in the mandate's own text.
6. Cost or market for rule 1; the public-book decision.

---

## 12. Live inventory (measured 2026-11-15 ~09:40 Bangkok)

| Object | Count / state |
|---|---|
| Instruments | 58 (11 `active`, 47 `watchlist`, 0 `archived`); none added since 13 Oct; all USD |
| Positions | 11 open, 0 closed |
| Transactions | 13 (1 deposit, 12 buys, 0 sells, 0 dividends); 10 with `planned_action_id`, 0 with `client_key` |
| Decisions | 133 (112 hold, 14 enter, 5 watch, 2 add, **0 reduce/exit**); last 13 Nov |
| Decision outcomes | **95** — 85 at 30 days, 10 at 90; 85 distinct decisions; **0 `wrong`**; 22 recorded before the horizon had elapsed on the clock |
| Review tasks | 118 (93 completed, 24 pending, 1 cancelled); 65 completed and 10 created since 13 Oct; scope: 70 company, 19 macro, 16 portfolio, 13 theme; pending triggers 13 `scheduled`, 11 `event_window` |
| Portfolio rituals | Monthly 2026-11 completed 3 Nov; diagnostics 15 Oct, 24 Oct, 7 Nov; pre-event NVDA completed 10 Nov; emergency review 13 Nov; pending: monthly 2026-12, pre-event Texas/ERCOT (3 Dec), quarterly Q4 (2 Jan) |
| Planned actions | 13 (9 confirmed buys, 1 confirmed add, 1 deferred VRT add, 2 cancelled); **0 pending** |
| Signals | 838 (**694 `data_completeness`**, 93 crowding, 28 new quarter, 23 price); all status `new` |
| Dossiers | 56; 49 investigate, 7 active_thesis; 53 `primary_verified`, 3 `investment_ready`; 230 versions (56 since 13 Oct, 33 since 3 Nov); 11 past `next_review_at`, 10 null |
| Valuation blocks | 9 dossiers (7 held); 9 `PROVISIONAL`, **0 `DECISION-GRADE`** |
| Documents | **0** |
| Fundamentals | 2,671 vintages (2,493 filing-dated, 178 estimated, **27 dated after their observation**) |
| Scorer setups | 56 as of 13 Nov; 1 stale; 42 complete, 14 partial; 24 `correction_candidate` |
| Market bars | 67,322; newest 2026-11-13 for SPY, QQQ and every holding; `bars:freshness` `stale: false` |
| Snapshots | 67 sessions 12 Aug → 13 Nov; all `as_of` 22:30Z; 0 alignment issues; 0 stale |
| Agent idempotency keys | 432, all MCP; 431 `200`, **1 pinned unknown** (25 Oct) |
| OAuth | 1 client (ChatGPT); 2 live refresh families — production (rotated 68 times, last 14 Nov) and **Deploy Preview (rotated 15 times, last 6 Nov)** |
| App users | 1 operator, 2 viewers |
| NAV / cash / invested / MV | $241,326.75 / $211,532.15 / $38,467.85 / $29,794.60 |
| Deployed sleeve | −26.8% since inception (unitized); DD 28.0%, max 36.0% |
| Scheduled ingest | 54 scheduled + 23 manual runs since 13 Oct, all green; 03:07 cron arriving 07:41–10:59 UTC; 05:07 retry 09:08–13:38 UTC |
| Process document | 1,273 lines, 113 KB (971 lines, 73 KB on 13 Oct) |
| Tests | 695 passing / 72 files; typecheck clean |
| Repo | `37792ee`; 11 commits since 13 Oct, 1 touching application code; 3 untracked files |

---

## 13. Reviewer's opinion: will it work, and can it be trusted with more capital?

Asked directly by the operator after the review was written. This section is
opinion, not measurement; the numbers it leans on are in §1, §3 and §6.

**Short answer: trust it to keep running the capital it has, not yet with
more, and do not bet on it beating the index over one to two years on the
evidence so far.** Implementing §11 does not change that answer, because §11
fixes plumbing and controls, not edge.

### 13.1 What the system has shown it can do

- It keeps an honest record and a true NAV.
- It restrains the operator: no panic sale and no averaging down through a
  36% sleeve drawdown.
- It catches some of its own errors, such as the deferred VRT add.

That is real and worth having. It makes the operator a more disciplined
investor than he would be without it.

### 13.2 What it has not shown

- **No evidence of stock-selection edge, and some against.** The sleeve is
  −26.8% since 12 August; NVDA, which the book does not hold, is −27.3% over
  the same window. Eleven researched names returned roughly what the factor
  bellwether did. So far the dossiers, gates and grades have produced the
  same result as simply owning the theme.
- **The entries were underwritten on models the process now calls
  unsupported.** The valuation gate fixes that going forward, but no purchase
  has yet been made under it, so it is untested as a selector.
- **The only automated scorer measured worse than its universe.**
- **Nothing has ever been sold.** The half of the process that limits losses
  on a broken thesis has no track record at all, and §7.3 found a defect
  waiting in its return maths.
- **The agent grades its own work** and has never called a thesis wrong in
  95 grades.

### 13.3 On profitability

Whether the sleeve makes money in one to two years depends almost entirely on
whether AI capex spending holds up, not on the system. If the factor recovers
the book will be profitable and that will prove little; if it does not, the
process will limit the damage mainly because 88% of NAV is in cash. Three
months on one correlated bet cannot distinguish skill from factor exposure in
either direction. The factor cannot be forecast from here, and the base rate
for concentrated thematic stock-picking beating the index is poor.

### 13.4 What would change this opinion

1. Six or more months of entries made under the valuation gate, with numeric
   priors stored at entry (plan item 17), graded at 90 days.
2. The sleeve beating a plain AI or semiconductor ETF over that period, not
   only SPY. This is the cheapest honest test of whether the research adds
   anything, and it is not measured today: add a factor benchmark beside SPY
   and QQQ in `getPerformance`.
3. At least one real `reduce` or `exit` executed on a thesis failure.
4. A written sleeve-level loss limit in the mandate (§11, mandate decision 1).
5. Someone other than the agent checking the grades.

### 13.5 What this means for the capital ladder

Finishing capital Phase 1 to $75k at the baseline pace is reasonable: it is
already authorised, small relative to NAV, and is how the evidence in §13.4
gets collected. Moving to the $150k proposal would be scaling a process whose
only proven property is caution. The ritual-13 transition review should be
required to answer items 1–3 above with numbers, which makes them a concrete
form of the relative-return clause the mandate has left open since
19 September.
