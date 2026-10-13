# PowerFund — full review, 13 October 2026

Fourth full review. Same shape as [2026-09-18](./2026-09-18-full-review.md):
intent → capital → software → process → bugs → tests → what next. Reads the
18 September review's §6.3 bug table, §10 ordered list and §13 calibration
backlog, the [30 September MCP open items](./2026-09-30-mcp-open-items.md)
and the [are-we-on-track](./2026-09-18-are-we-on-track.md) quick wins as the
live lists, and closes or carries each one in §4.3.

Measured against production on **13 Oct 2026, 11:16 Bangkok** (= 13 Oct
00:16 ET, after the 12 Oct cash close and before the 03:07 UTC ingest had
landed — §1.1c says why "before" is the normal state). Every number below is
from read-only SQL against the production project, from `snapshot:verify`,
`bars:freshness` and `verify:book` (all dry runs), from the GitHub Actions run
log, or from the repo at `58549c2` (7 Oct; tree clean, `main` even with
origin). Typecheck clean; **694 Vitest tests in 72 files pass** (315/49 on
18 Sep).

---

## 1. Verdict

**The process now learns, and in the last three weeks it also earned money.
The measurement layer is still trustworthy, the rituals ran on schedule
including the first quarterly review, and the agent moved to MCP without
losing a write. Three defects found today sit *under* that, in places the
previous reviews declared safe: the book is readable by anonymous callers
through one RPC, the adjusted-price series is spliced at every ex-dividend
date, and the nightly ingest the plan calls "03:07 UTC" has been landing at
10:00.**

Twenty-five days after the last review:

| Series | 17 Sep diagnostic (16 Sep closes) | Today (9 Oct closes) |
|---|---|---|
| Unitized deployed sleeve since inception (12 Aug) | −13.8% | **−5.9%** |
| SPY / QQQ over the same window | −2.4% / −2.6% | +0.8% / +3.8% (price; §1.1b on why TR is ~+1.0% / +3.9%) |
| Sleeve relative to SPY / QQQ | −11.4 / −11.2 pp | **−6.6 / −9.7 pp** |
| Deployed drawdown from peak (unitized) | 15.2%, max 17.0% | **7.4%**, max 17.0% |
| Deployed sleeve on cost | −10.1% | −1.0% ($36,106 on $36,467) |
| NAV | $247,233 (−1.1%) | **$249,640 (−0.1%)**; peak $250,667 on 6 Oct |
| Cash | 90.0% of NAV | 85.5% of NAV |

Between the two reviews the sleeve returned about **+9.2%** against SPY +3.3%
and QQQ +6.6%. That is one good three-week stretch on eleven correlated names
and proves nothing about skill; it does mean the 15% diagnostic has not fired
since 17 Sep and the Phase-1 record is no longer uniformly against us. The
quarterly review's own reading — "Q3's weakness was entry timing, valuation
discipline and shared-factor concentration, not a broken AI thesis" — is the
right level of claim, and §3.6 asks the one question it leaves open: the 44
grades written so far contain **zero** `wrong` theses.

### 1.1 Headline software findings

**(a) Anyone with the public anon key can read the whole book.**
`verify_book_against_ledger()` is `security definer`, returns one row per
held symbol with the ledger quantity and cost basis plus the cash balance, and
is executable by `anon` and `authenticated` — PostgreSQL grants `EXECUTE` to
`PUBLIC` by default, the 13 Aug revoke only touched the explicit `anon`
default, and PostgREST serves every executable public function at
`/rest/v1/rpc/<name>`. Verified today: `set role anon; select * from
verify_book_against_ledger()` returns `cash 213533.39`, `quantity:CLS
14.35535`, and so on for every position. The anon key ships in the browser
bundle. This is the "viewers read research, never the book" invariant broken
by a function rather than a table, and `viewer_read_surface.sql` did not see it
because it asserts over tables only — the hollow-pass pattern the testing
notes warn about. No money can move through it. One migration closes it (§7.3
P0); the test that should have caught it is in §10.

**(b) `adj_close` is spliced at every ex-dividend date, and positions are
marked at it.** The ingest refetches a ~7-day window and compares `close` to
decide whether the vendor re-based the series. A dividend changes `adj_close`
on *every prior row* and `close` on none, so the detector is blind to it and
the upsert rewrites only the window. Production shows the signature on SPY
(factor steps 1.00000 → 1.00248 on 14 Sep, back to 1.00000 on the 18 Sep
ex-date), QQQ (15 / 21 Sep), VST (15 / 21 Sep), VRT (8 / 14 Sep) and CEG
(10 / 18 Aug). Two consequences. The benchmark "total return" since 12 Aug is
computed as 772.49 → 778.57 = +0.79%, which is the *price* return: the
quarterly dividend (~0.25% for SPY, ~0.1% for QQQ) is lost at the window
boundary, and will be lost again every quarter — ~1.0%/yr of SPY TR
understated, which flatters every relative-return number by that much. And
`adj_close ?? close` is the mark in `snapshots.ts`, `portfolio.ts`, `book.ts`
and the agent's `last_close`, so a dividend-paying holding is marked below its
real close on the sessions inside the refetch window after an ex-date (VST on
15–18 Sep, by 0.16%). Dollars today: single digits. The 7 Sep remediation log
struck "benchmarks are price return" because `adj_close` was fully populated
and consistent — it was, until the first ex-dividend after the backfill. The
finding is different from the one struck, and the strike should stand with
this note beside it.

**(c) "03:07 UTC" ingest lands at ~10:00 UTC, and the operator is the
retry.** GitHub's scheduler has been delivering the 03:07 cron between
+4h51 (19 Sep) and **+7h17 (8 Oct)**, worsening week on week; the 05:07
stale-gated retry lands at 11:00–11:54 UTC. The design assumed "seven hours for
Yahoo to publish the bar" and got "the bar is in the store at 17:00 Bangkok".
Six `workflow_dispatch` runs at ~02:50 UTC between 30 Sep and 10 Oct are the
operator firing it by hand before the morning briefing. Every scheduled run
succeeded; the retry has never had work to do (16–27 s runs), so vendor lag is
solved and scheduler lag is the whole problem. At review time
`bars:freshness` reports `stale: true`, expected session 2026-10-12, store
through 2026-10-09 — correct, and it will say that until mid-afternoon every
day. ADR 0006 chose GitHub Actions because Netlify's scheduler never fired;
GitHub's fires late. §7.3 P1 proposes `pg_cron` as the trigger.

### 1.2 What the last review got right, and what it left

Of the 18 Sep P0/P1 items: both P0s (sell routing, direction-aware gate), the
session bucketing, the re-gating of revived actions and `withActor` are
**closed and verified** against production today. Of its process findings,
grades (0 → 44), earnings tasks (0 → 11/11 held names), BWXT clutter,
idempotency keys (0 → 156) and `instruments.status` are closed. **Still open
and carried**: `data_completeness` signals (now 408 of 483), the holiday
calendar, `documents`, `price_basis`, the per-instance rate limit, and the
four mandate decisions. Full table in §4.3.

---

## 2. Two roadmaps

Unchanged: **software Phase N never authorises capital Phase N**. Capital is
Phase 1 ($75k invested-cost cap, ~$10k/month baseline) and invested cost is
$36,467, 48.6% of the cap. Software is Phase 1 with Phase 2 machinery built
and the Phase 3 minimum slice live and now agent-readable. `$150k` and `$225k`
remain proposals. The October monthly pass and the Q3 quarterly review both
recorded "baseline / selective, do not accelerate" as capital decisions in
capital rituals. Good.

---

## 3. Capital roadmap

### 3.1 Live book (9 Oct 2026 close)

| Symbol | Theme | Opened | Cost | MV | P&L | Instrument | Dossier |
|---|---|---|---|---|---|---|---|
| VRT | ai-infrastructure | 12 Aug | $5,000 | $4,094 | −18.1% | active | investigate |
| CLS | ai-infrastructure | 13 Aug | $5,000 | $5,199 | +4.0% | active | investigate |
| NVT | ai-infrastructure | 13 Aug | $4,500 | $4,407 | −2.1% | active | investigate |
| MRCY | defence | 13 Aug | $2,500 | $1,820 | **−27.2%** | active | investigate |
| NBIS | ai-infrastructure | 13 Aug | $1,500 | $1,307 | −12.9% | active | investigate |
| VST | energy | 28 Aug | $3,000 | $3,459 | +15.3% | active | investigate |
| ISRG | robotics-ai | 31 Aug | $3,000 | $3,401 | +13.4% | active | investigate |
| CRDO | ai-infrastructure | 2 Sep | $3,000 | $3,825 | +27.5% | active | active_thesis |
| KTOS | defence | 28 Sep | $1,994 | $1,912 | −4.1% | active | investigate |
| SNDK | ai-infrastructure | 1 Oct | $3,973 | $3,607 | −9.2% | active | investigate |
| CEG | energy | 9 Oct | $3,000 | $3,076 | +2.5% | active | active_thesis |

Invested cost $36,466.61; cash $213,533.39; ledger and `portfolio_state.cash`
agree to the cent; `verify:book` 23 checks, 0 failing, 0 guards disabled. All
eleven positions carry a written `invalidation` and `thesis_summary` (rule 4);
nine of eleven fills came through confirmed planned actions (VRT and CLS
predate the queue). By theme: AI infrastructure $22.4k (62% of the sleeve,
9.0% of NAV), energy $6.5k, defence $3.7k, robotics $3.4k.

`instruments.status` now tells an owned name from a watched one. **Dossier
status still does not**: nine of eleven held names are `investigate`, the
same state as 42 research stubs. The 18 Sep review called this "ritual 5 has
no state to move things into"; the instrument half was fixed, the dossier
half was not.

### 3.2 The sleeve, relative return, and what changed

The sleeve's recovery came from CRDO (+$825), VST (+$459), ISRG (+$401) and
CLS (+$199) against VRT (−$906) and MRCY (−$680). Two of the four winners are
the independent-factor names the diagnostics kept asking for. The two
largest losers are the two oldest AI-capex/defence starters whose dossiers
have not been re-underwritten since 15 Aug (VRT) and 1 Sep (MRCY) — the Q3
prints on 21 Oct and ~3 Nov are the evidence cycle both are waiting for.

The relative numbers the mandate cares about, since inception: deployed
sleeve **−6.6 pp vs SPY, −9.7 pp vs QQQ**; NAV −0.1% vs SPY +0.8% (NAV
"beat SPY" over Q3 as the quarterly says, and has fallen behind it since,
because 85% cash in a rising market is a cost the NAV series records
honestly). These should be quoted net of the §1.1b correction once it lands:
SPY TR is ~0.25 pp higher than the stored series says.

### 3.3 Capital Phase-1 evidence scorecard

| Proof | 18 Sep | Today | Evidence |
|---|---|---|---|
| Every fill through the queue with thesis and invalidation | Met | **Met** | 11/11; 9 via confirmed planned actions |
| Weekly holding review persisted | Met, slipped once | **Met, slipped again** | Holds 15 Sep (8), 22 Sep (8), 30 Sep (8), **10 Oct (8)**. 30 Sep → 10 Oct is the second 10-day gap in eight weeks |
| Monthly book pass + ranking | Met | **Met** | `Monthly book pass — 2026-10` completed 1 Oct with a 14-name ranking and `technical_state`; November rolled |
| Quarterly review | Not yet due | **Met — first one** | `Quarterly book review — 2026-Q3` completed 2 Oct: scoreboard, `getRiskSnapshot` quoted with `as_of`, theme conclusions, calibration by class; Q4 rolled to 2 Jan |
| Drawdown diagnostic when breached | Met (3) | **Not triggered** | Sleeve has stayed under 15% since 17 Sep; re-open rules had nothing to re-open |
| Decision grades | Not started | **Running and reconciled** | 44 grades, all `horizon_days = 30`, 44 distinct decisions, 0 owed, 3 `no_fill` reported. First 90-day grades fall due **10 Nov** (VRT) |
| Sell path exercised | Not met | **Not met** | 87 decisions, 0 `reduce` / `exit`; 12 transactions, 0 sells |
| Track record vs benchmark | Negative (−11 pp) | **Negative, narrowing** (−6.6 pp vs SPY) | §3.2 |
| Catalyst calendar for held names | Partial, no Q3 tasks | **Met** | 79 pending tasks (35 Oct, 32 Nov, 9 Dec); every held name has its Q3 print, 56 of 79 use `event_window` for estimated dates, 22 `scheduled` for confirmed ones |

### 3.4 Deployment pace

$8,966 deployed since 18 Sep (KTOS 28 Sep, SNDK 1 Oct, CEG 9 Oct) ≈ $10.8k
per month, on baseline after a September of $5k. Two of the three were
deliberately outside the AI-capex complex. At this pace the cap arrives
around February 2027. Both October rituals said "opportunity budget, not
quota", and the September under-deployment was written down — rule 3 of the
ladder is being followed as written.

### 3.5 The scorer is still a shadow, correctly

`fundamental_inflection_v1` remains off Briefing and off the gate. 56 setups
as of 9 Oct, 0 stale, 43 complete; the five `dataGap` names (TSM, CCJ, NBIS,
IREN, SKHY) carry months-to-resolve of 3–12. No tuning. `watchlist_membership`
has recorded three observed additions (TT, ITRI, VICR on 4 Oct) on top of the
55 seeded rows — the clock is running.

### 3.6 Calibration: the grades are in, and they are kind

44 thirty-day grades, read as a distribution rather than a list:

| Dimension | Distribution |
|---|---|
| `thesis_grade` | 31 correct, 13 partly correct, **0 wrong** |
| `timing_grade` | 24 good, 6 mixed, 14 poor |
| `sizing_grade` | 40 good, 4 mixed |
| `risk_management_grade` | 39 good, 5 mixed |

On a sleeve that lagged QQQ by ten points over the period, the process judged
its own thesis work never wrong, its sizing right 91% of the time and its risk
management right 89% of the time, and put the loss on timing. That reading may
well be correct — the quarterly makes the argument carefully, and small
starters plus 85% cash *did* contain the damage — but it is also the most
comfortable reading available, and the grader is the agent that wrote the
decisions. Two things follow. The quarterly roll-up did publish the per-class
distributions, which is right; what it did not remark on is the zero in the
`wrong` column across 36 theses, and the roll-up should be required to say
whether a column is empty and why. And the 90-day cohort due from 10 Nov is
the real test: VRT at −18% and MRCY at −27%
graded `thesis: correct` at 30 days will have to be re-argued at 90 with the
Q3 prints in hand, on evidence through day 90 only (ritual 12b). An
operator spot-check of a handful of grades per quarter, recorded in the
quarterly outcome, would cost an hour and is the only external check the loop
has.

---

## 4. Software roadmap

### 4.1 Shipped since 18 Sep (62 commits)

The sell path and direction-aware gate (18–19 Sep); clocked, horizon-named,
append-only grades with `getCalibrationStatus` and `no_fill` reporting
(18–19 Sep); `watchlist_membership` (18 Sep); `instruments.status` by trigger
with `setWatchlistArchived` (20 Sep); `client_key` on hand-booked fills (20
Sep); contribution bucketed on the session (20 Sep); the Memory timeline (20
Sep); `verify:book` in the nightly path and `ledger_guard_status()` (19 Sep);
confirmed-vs-estimated earnings dates (`event_window`, 19 Sep); the **MCP
server, PowerFund OAuth, plugin package, exposure manifest, previewed
triggers, read-only previews, pinned-unknown idempotency** (28 Sep – 1 Oct);
`getRiskSnapshot` (2 Oct); the technical-state entry-staging layer (1 Oct);
the source-link gate on dossier writes (1 Oct); the dossier revision gate
(7 Oct); the Playbook page and landing copy (4 Oct).

**The GPT → plugin cutover happened on 1 October.** `review_tasks.created_by`
flips from `chatgpt` (last row 19 Sep) to `chatgpt-mcp` (first row 1 Oct);
`decision_outcomes.actor_name` from `PowerFundAgent` (last 30 Sep) to
`ChatGPT` (from 1 Oct); all 156 `agent_idempotency_keys` rows are MCP writes
(67 `createReviewTask`, 50 `updateDossier`, 12 `recordDecisionOutcome`, 11
`createDecision`, …), every one `200`. One live production refresh token with
read-write scopes; one live **Deploy Preview** refresh token (read scopes,
never used) that should be revoked. `plan.md` still says "the GPT migration
itself … has not happened yet" and the runbook's status table stops at phase
D — both are stale. OpenAI's GPT retirement is reported for **11 Dec 2026**;
the REST fallback and the published-instruction backup (runbook phase I)
should be done before then regardless.

### 4.2 Phases

Phase 1: the weekly, monthly and quarterly process ran entirely through
PowerFund over MCP in October. Open from the plan: `company_events`, signal
inbox CRUD (blocked on the inbox being readable), the holiday calendar.
Phase 2: unchanged — machinery built, exit criterion not met, replay waits on
elapsed membership history. Phase 3: the risk view is now quoted in the
quarterly from `getRiskSnapshot` rather than pasted; still informs, does not
block.

### 4.3 Closure of 18 Sep items — verified today

Severity and numbering as in the 18 Sep review.

| Item | State | Evidence |
|---|---|---|
| §6.3 **P0** queue confirm books a buy | **Closed 19 Sep** | `confirmPlannedAction` routes by `action_type`; `planned-actions.test.ts` |
| §6.3 **P0** direction-blind gate | **Closed 18 Sep** | `mandateGate({ side })`; `enforce.test.ts` sells skip caps and kill-switch |
| §6.3 P1 session vs UTC day | Closed 20 Sep | `anchorSession` in `dates.ts` |
| §6.3 P1 `data_completeness` signals | **Open, worse** | 483 rows, **408** `data_completeness` (84%); 146 of the 166 written since 18 Sep; spikes of 68 / 34 / 34 on 18, 23, 24 Sep |
| §6.3 P1 holiday calendar | **Open** | `dates.ts:90` "Weekends only — no holiday calendar". Next test: Thanksgiving 26 Nov |
| §6.3 P1 benchmark TR label | Struck 19 Sep, **superseded by §1.1b** | The label was right; the series is now spliced |
| §6.3 P1 cancelled → pending ungated | **Closed 18 Sep** | Gate re-runs whenever status becomes `pending` (`9ffd429`) |
| §6.3 P2 `withActor` double prefix | **Closed 19 Sep** | Strips the leading tag; stacked rows collapsed by migration; live MRCY/BWXT rows carry one tag |
| §6.3 P2 `instruments.status` | Closed 20 Sep | 11 `active`, 47 `watchlist` |
| §6.3 P2 `bookFill` retry | Closed 20 Sep | `client_key` + partial unique index |
| §6.3 P2 `listDecisions` unbounded | Closed 20 Sep | Paged |
| §6.3 P2 agent idempotency not required | **Closed in practice** | Every MCP write is keyed by construction; 156/156 keyed since 1 Oct. REST still optional — leave it, REST is the fallback |
| §6.3 P2 `computeDrawdown` NAV | **Closed 19 Sep** | Unitized (`7ee7fc0`) |
| §6.3 P2 `verify_book_against_ledger()` never run in production | **Closed 19 Sep**, and it found something today | `verify:book` nightly; 23/23 ok. The function is the subject of §1.1a |
| §6.3 P2 `documents` empty | **Open** | 0 rows |
| §6.3 P2 DATA-2 `price_basis` | **Open** | No column |
| §6.3 P3 rate limit per instance | **Open** | Unchanged; MCP open item 4 |
| §6.3 P3 queue empty-state copy | **Closed** | String no longer exists |
| §6.1 weekly review gap | **Recurred** | 30 Sep → 10 Oct |
| §6.1 `decision_outcomes` = 0 | **Closed** | 44, reconciled |
| §6.1 no earnings tasks | **Closed** | 11/11 |
| §6.1 held names `investigate` + `watchlist` | **Half closed** | Instruments fixed; 9/11 dossiers still `investigate` |
| §6.1 BWXT pending with no date | **Closed 29 Sep** | Cancelled when the Investor Day changed the information set; reason written |
| §6.1 `agent_idempotency_keys` empty | **Closed** | 156 |
| §7.1 no earnings/filing source | **Open** | Calendar is full by agent discipline, not by construction; plan item 16 |
| §7.3 pipeline health in signals | **Open** | As above |
| §7.4 weekday-only calendar | **Open** | As above |
| §7.5 `documents` | **Open** | — |
| §7.6 ledger verification test-only | **Closed** | — |
| §10.4 stop `data_completeness` | **Open** | — |
| §10.7 holiday-aware clock | **Open** | — |
| §10.10 earnings dates | **Open** (calendar met by hand) | — |
| §10.12 grade the 30 Aug enters | **Closed 19 Sep** | — |
| §13.2 reconciliation diagnostic, `ungradeable_reason` | Closed 19 Sep | `getCalibrationStatus` |
| §13.3 purpose-built calibration read surface with `evidence_cutoff_at` | **Open** | Grades are written from `getJournal?horizon_due=true`; no cutoff field |
| §13.4 class-aware analytics with distinct-name counts | **Partly** | `getCalibrationStatus` splits by class; the quarterly quoted classes; distinct-name counts and grade distributions are not surfaced |
| MCP open item 1 — unknown MCP writes re-runnable after an hour | **Open** | No `request_key` column; the preferred fix is still the right one |
| MCP open item 2 — `private_key_jwt` | Open, hardening | — |
| MCP open item 3 — grants page | **Open, now with a stale grant** | Preview-resource refresh token live until 9 Nov |
| MCP open items 4–6 | Open, low | — |
| Are-we-on-track 2.1 pre-mortem numbers at entry | **Open** | Plan item 17; the Q3 prints are the first chance to use them |
| 2.2 clocked grades | **Closed** | — |
| 2.3 dollar-at-risk | **Open** | Plan item 18 |
| 2.4 relative benchmark in the mandate | **Open** — "pick N at the 1 Oct pass" did not happen | Mandate open decision 1 |
| 2.5 factor as gate input | **Open**; measured and quoted in Q3 | Plan item 19 |
| 2.6 point-in-time watchlist | **Closed** | — |
| 2.7 falsifier on every diagnostic | **Partly** | Ritual 11 asks whether a prior classification still holds; it does not demand the count or the falsifier. Mandate open decision 2 |

---

## 5. What we are doing well

Named so they are kept, not as reassurance.

1. **The rituals run and leave a durable record.** In October the monthly
   pass, the first quarterly, weekly holds on every name, 12 grades, and 67
   calendar rows were all written through the API, with "previous belief →
   new evidence → updated belief" actually present in the outcomes. The
   calendar now looks like a desk's: every held name's print, confirmed dates
   `scheduled`, estimates as windows, macro and theme events alongside.
2. **The measurement layer held under change.** 42 session-keyed snapshots,
   `alignmentIssues: []`, `staleSessions: []`, `verify:book` 23/23 with guards
   armed, every `as_of` at 22:30Z, three new fills and a Deploy Preview
   sharing the database without a wrong number appearing. The kill-switch read
   a true series through a 17% drawdown and a 9% recovery.
3. **The learning loop exists and is reconciled.** 44 grades, one per
   decision per horizon, reported with their `no_fill` exclusions; the first
   quarterly read them by class and refused to pool continuation holds with
   entries. Six weeks ago this table had zero rows.
4. **The process names its own rule-breaks.** NBIS's invalidation records the
   entry as "a rule-6 filter violation"; the MRCY add was cancelled on the
   print it was conditional on; BWXT was cancelled when the Investor Day
   changed the information set rather than confirmed on impulse; September
   deployed half the baseline and said why. That is the anti-chase and
   no-average-down evidence Phase 1 asks for, in writing.
5. **Diversification is being acted on, not just diagnosed.** Two of the last
   three entries (KTOS, CEG) sit outside the AI-capex complex; the quarterly
   quoted the correlation matrix (`NVT–VRT 0.711`, `KTOS–MRCY 0.613`) and drew
   the "theme labels are not diversification" conclusion from numbers it
   fetched itself.
6. **The MCP cutover was done the hard way and it shows.** Three reviews before
   launch, an exposure manifest that forces a decision per operation,
   resource-bound tokens so a preview grant cannot write production,
   idempotency that pins an unknown outcome rather than guessing, an eval
   suite, and a tool catalog that cannot drift. 156 writes, zero
   non-200s, and the legacy GPT stopped writing the day the plugin started.
7. **Engineering discipline is intact.** Commits read as reasoning; every
   migration went through `db reset`; CI applies all 37 migrations to an empty
   database; the review documents close each other's items rather than
   rediscovering them; `CLAUDE.md`'s invariants were accurate and useful again
   today.

## 6. What we should improve

1. **Security assertions that pass hollow.** `viewer_read_surface.sql`
   proves viewers cannot read book *tables* and says nothing about functions;
   the book leaked through an RPC the same migration set created. The RLS
   suites need a negative over every `security definer` function and over
   `/rpc` as a surface, not only over `from(table)`.
2. **Freshness was designed around an assumption nobody measured.** The 18 Sep
   review asked for the 05:07 retry to be checked "on Monday 22 Sep after four
   mornings". The check would have shown the first run landing at 08:27. The
   lesson from `bars:freshness` — a green exit code is not evidence — applies
   to the scheduler too: measure arrival time, not configured time.
3. **Series integrity was learned for `close` and not generalised.** The APH
   split taught "compare before writing, overwrite only on a consistent
   signature". `adj_close` has the same failure mode with a quieter signature
   and was left out of the comparison. The invariant is simple — `close /
   adj_close` must never *increase* as dates advance — and `bars:audit` should
   assert it.
4. **The loop grades itself.** §3.6. Not a flaw in the schema; a flaw in who
   holds the pen. Publish distributions, spot-check, and let the 90-day cohort
   be argued with the prints.
5. **Nothing has ever been reduced or sold.** Correct by the rules — every
   invalidation is fundamental and none has triggered — but Phase-3 proofs 1
   and 2 ("multiple decision types", "actual thesis failures handled") have
   zero evidence, the sell path has never touched money, and MRCY has eleven
   consecutive holds at −27%. The MRCY Q1 FY27 window (~3 Nov) should carry,
   in its `instructions`, the specific print outcome that would make the next
   decision `reduce` rather than a twelfth `hold`.
6. **Scenario values are still prose.** Plan item 11 and the remediation log's
   "largest remaining gap" are unchanged for six weeks. The dossier revision
   gate (7 Oct) exists *because* a 24/60-month table can disappear in a
   rewrite — the durable fix is a stored object the app can re-price, which
   also makes "scenario calibration credible" (Phase-1 proof 5) checkable
   rather than asserted.
7. **Docs drift faster than they used to.** `plan.md` says the migration has
   not happened; the runbook's status stops at phase D; the inflection-signal
   count and hold count in the plan are five weeks old. Cheap to fix; costly
   when the next reviewer trusts them.
8. **Four mandate decisions have been open since 19 Sep** and the monthly pass
   that was supposed to pick N for the relative-return clause did not. They
   are operator decisions and they are blocking nothing today — but the
   Phase-1 → 2 review will need them written, and January is closer than it
   looks.

---

## 7. Gaps, inconsistencies, bugs, unaccounted risks

### 7.1 Process inconsistencies

| Finding | Why it matters |
|---|---|
| Weekly review slipped to 10 days again (30 Sep → 10 Oct) | Second slip in eight weeks; the `thesis_review` flag fires at 7. Measure it on the monthly pass as a count, not an apology |
| 44 grades, 0 `wrong` theses, 91% sizing good | §3.6. The 90-day cohort from 10 Nov must be graded on day-90 evidence only, with the distribution published |
| 9 of 11 held dossiers are `investigate` | Ritual 5 still cannot tell an owned thesis from a stub on the research surface; `active_thesis` is used for five names of which two are held |
| KTOS dossier has no `next_review_at` | The one held name the Research tab's `review_due_date` clock can never reach |
| Stale Deploy Preview OAuth grant | Read-only and resource-bound, so harmless — and still the kind of thing a grants page exists to show |
| Mandate open decisions unchanged since 19 Sep | §6.8 |
| Plan and runbook status stale | §6.7 |

### 7.2 Mandate vs code

| Rule | Doc | Code |
|---|---|---|
| Kill-switch 15% | Diagnostic in Phase 1 | Matches; direction-aware since 19 Sep; has not fired since 17 Sep |
| Max position (rule 1) | "cost and/or market" | Market vs NAV. **Still not chosen** |
| Benchmarks total-return | Required | `adj_close` is read, and is **spliced** (§1.1b): the stored SPY series returns price-only across each ex-date boundary. Understated ~0.25 pp per quarter |
| Deposits/withdrawals | Allowed | Both drawdown paths unitized since 19 Sep. Matches |
| Rule 4 written invalidation | Required | Met 11/11 |
| Dividends | NAV = cash + marked stocks | No `dividend` booking path exists (the enum has the kind; nothing writes it). VST and CEG pay; the book's cash will drift below the broker's by a few dollars a quarter until it does |
| Relative return | "Judge NAV and the deployed sleeve vs S&P 500 and QQQ" | `getPerformance` computes it and the quarterly quoted it — reporting discipline met. No rule reads it (open decision 1) |

### 7.3 Coding and data bugs

| Sev | Area | Issue |
|---|---|---|
| **P0** | Access control | `verify_book_against_ledger()` is `security definer` with `PUBLIC` execute; `anon` and `authenticated` receive every held symbol, quantity, cost basis and the cash balance via `/rest/v1/rpc/`. Migration: `revoke execute … from public, anon, authenticated; grant execute … to service_role` (the worker is the only caller). Then a SQL test that iterates `pg_proc` for `prosecdef` functions in `public` and asserts neither role can execute any that reads a book table, plus the positive: `service_role` still can. Re-run the Supabase security advisor after; it flagged this today under "anon can execute SECURITY DEFINER function". |
| **P1** | Prices | `adj_close` splice at ex-dividend dates (§1.1b). Three changes: (1) **mark at `close`**, never `adj_close`, in every level read — worker `snapshot/portfolio.ts`, `data/portfolio.ts`, `book.ts`, `companies.ts` `last_close`, `research.ts` `lastClose`, `performance.ts` `loadLivePerformanceMark`, and the `price` condition trigger in `packages/db/review-triggers.ts` (§11 item 2 has the full list) — a mark is a price, adjustment is for return series; (2) in `ingestBars`, compare the stored `close/adj_close` factor to the fetched one over the overlap and, when it has changed consistently, refetch the whole series (the split path, without the `close` discontinuity guard, which cannot fire on a dividend); or simply refetch benchmarks and held names in full weekly — 13 symbols; (3) `bars:audit` asserts the factor is non-increasing with date per symbol. Then rebuild snapshots and confirm `alignmentIssues: []` and that NAV history moved by cents, not dollars. |
| **P1** | Scheduling | Ingest lands 5–7 h after its cron (§1.1c). Trigger the workflow from somewhere that keeps time: `pg_cron` + `pg_net` on the production project calling GitHub's `workflow_dispatch` at 03:07 UTC with a fine-grained PAT stored in Vault, leaving the schedule as the fallback. Add a freshness alert (the existing `bars:freshness` output, posted or emailed) if the store is still behind at 05:00 UTC. Record the arrival-time measurement in ADR 0006. |
| **P1** | Signals | `data_completeness` transitions written as signals — carried, now 408/483. Stop writing them; one `scorer_runs` row per run; migration deletes the rows. |
| **P1** | Calendar | Weekday-only session clock — carried. Thanksgiving 26 Nov is six weeks away; 27 Nov is a half-day. Use SPY's stored bars where they exist, a static NYSE list forward. |
| P2 | Vintages | 21 of 161 `estimated` vintages have `knowable_at` **after** `observed_at` (AVGO FY-Q3 is dated knowable 29 Oct, observed 6 Sep). Conservative direction, so no look-ahead, but a date that says we did not know something we had already stored is wrong. `knowable_at = least(period_end + 90d, observed_at::date)`; reproject. |
| P2 | Dossiers | Dossier status does not follow the book. Either a `held` state set by the same trigger that moves `instruments.status`, or the agent promotes to `active_thesis` on fill (ritual 7). Nine rows today. |
| P2 | Book | No dividend booking path. Smallest version: a `dividend` kind on the manual-flow modal with instrument, amount and `client_key`; `apply_transaction` already credits cash for the kind. |
| P2 | OAuth | No grants page; a preview grant is live (MCP open item 3). Until the page exists, revoke it by SQL. |
| P2 | `documents` / `company_events` | Carried; the calendar is met by agent discipline every Saturday. One table fed from `fundamentals_vintages.filed_at` would give "last four filings" for free. |
| P2 | DATA-2 `price_basis` | Carried. |
| P3 | Rate limit | Per instance — carried (MCP open item 4). |
| P3 | Advisor | `transactions_append_only` has a mutable `search_path`; set it like the other guards. Leaked-password protection is off in Auth. |
| P3 | Docs | `plan.md` migration line; runbook status table; counts in plan items 7 and 15. |

### 7.4 Risks not in the mandate

| Risk | Note |
|---|---|
| **The anon key is public and one function returned the book** | Closed by §7.3 P0. The residual risk is the class: any future `security definer` helper is PUBLIC-executable unless revoked, and only a test over `pg_proc` keeps that from recurring |
| Relative return still not a rule | Carried. The gap is narrowing (−6.6 pp) which makes it easier, not less necessary, to write the clause now |
| Factor concentration | AI-capex complex is 62% of the sleeve and 9% of NAV; the quarterly measured it and raised the hurdle for adds. Still a view, not a gate (plan 19) |
| Self-graded calibration | §3.6 |
| GPT retirement 11 Dec | The plugin is live and REST is the fallback, so not a cliff — but the published GPT instructions have not been backed up (runbook phase I) and will be lost with it |
| Coinbase commingling, viewer accounts, public book | Unchanged, undecided, and sharper after §1.1a |

---

## 8. Architecture gaps

Ordered by how much they block a ritual or an invariant.

1. **No function-level access test.** The RLS suites assert over tables. A
   `security definer` function is an API; it needs the same negative.
2. **Adjusted and unadjusted prices share one column's semantics.** Marks need
   `close`; returns need a consistently adjusted series; the store cannot
   promise the second with a windowed refetch. Decide: full refetch for the
   15 names that matter, or a factor-change detector.
3. **The scheduler is not under our control and we do not measure it.**
   `pg_cron` is.
4. **Pipeline health lives in the signals table.** Carried.
5. **Trading calendar is weekday-only.** Carried.
6. **No stored scenario object.** Carried from 3 Sep; now the thing the dossier
   revision gate is compensating for by instruction.
7. **No event source.** Carried; the calendar is maintained by hand, well.
8. **No dividend path.** Small, and the first non-trade cash movement the
   ledger will see.

## 9. Model and logic gaps

- **Scorer evaluation waits on history**, not tuning — unchanged and correct.
- **Grades without stored priors.** Plan item 17 (expected 12-month return,
  probability of invalidation, bear loss, the observable that must occur) is
  what would let a 90-day grade say *which belief* was wrong. The five Q3
  prints in the next three weeks are the cheapest place to start writing
  those numbers — into each print task's `instructions` before the print.
- **Entry timing is the dimension being blamed, and the system has no timing
  model.** The technical-state layer (1 Oct) is the first explicit one; it is
  recorded in ranking tables, not in a field, so in a year nobody can ask
  "did `basing` entries do better than `downtrend` entries". A `technical_state`
  column on `planned_actions` would make that question answerable later for
  the cost of one enum now.
- **Position sizing is dollar-fixed** — carried; plan item 18.

---

## 10. Tests

694 tests in 72 files (315/49 on 18 Sep). The 23 new files are mostly the MCP
and OAuth surface — exposure, catalog, idempotency, outputs, handler, evals,
plugin, deploy mode — and `queue-preview`, `memory-timeline`, `source-lint`,
`risk`. The tests the 18 Sep review asked for now exist for: a queued sell
produces a sell (`planned-actions.test.ts`), the gate with `side: "sell"`
(`enforce.test.ts`), `withActor` idempotence (`planned-actions/mutate.test.ts`),
session bucketing. Still missing, and each is a finding above:

- **`anon` and `authenticated` cannot execute any `security definer` function
  that reads `positions`, `transactions`, `portfolio_state` or
  `portfolio_snapshots`; `service_role` can.** Would have caught §1.1a. Assert
  the positive too, so a blanket revoke that breaks the worker fails the test.
- **`close / adj_close` is non-increasing with date for every symbol** in the
  store (an invariant over stored data, run by `bars:audit`). Would have caught
  §1.1b on 15 Sep.
- **A snapshot marks a position at that session's `close`**, not its
  `adj_close` — extend `snapshot-alignment.test.ts` with a fixture where they
  differ.
- **`knowable_at <= observed_at`** for every vintage (SQL suite).
- A scorer run in which only `stale`/`completeness` changed writes no signal
  row — carried.
- `lastCompletedCashSession` on a US holiday returns the previous session —
  carried.
- An ingest run's *arrival time* is recorded and a store still behind at 05:00
  UTC raises something a human sees — not a Vitest test; an alert.

`apps/worker` still has no in-package tests; the extraction-to-domain pattern
is holding and should be used for the factor detector and the holiday calendar.

---

## 11. The next two weeks (13 – 27 October)

Earnings season frames the sprint: ISRG (window opens 20 Oct), VRT (21 Oct),
CLS (27 Oct, confirmed), SNDK (29 Oct, confirmed), NVT (30 Oct), then KTOS,
MRCY, CEG, VST and NBIS in the first ten days of November. The software work
should be finished before the prints start arriving, and the process work is
*about* the prints.

**Code, in order.** Each is one commit with a test; 1–3 are the first two days.

1. **Close the book leak.** Migration revoking `PUBLIC`/`anon`/`authenticated`
   execute on `verify_book_against_ledger()` (and any other definer function
   that is not meant to be public — audit the seven the advisor listed; the
   trigger functions cannot be called directly but revoking costs nothing),
   grant `service_role`. SQL test over `pg_proc`. Confirm `verify:book` still
   runs. `db reset`, then `db push`.
2. **Mark at `close`.** Replace `adj_close ?? close` with `close` wherever a
   price is used as a *level*: worker `snapshot/portfolio.ts`, `data/portfolio.ts`,
   `api/v1/book.ts`, `agent/companies.ts` `last_close`, `data/research.ts`
   `lastClose`, `data/performance.ts` `loadLivePerformanceMark`, and
   `packages/db/review-triggers.ts` — the last one matters most, because a
   `price` condition trigger is a threshold the operator set from a quoted
   price and is today compared against an adjusted one. Keep `adj_close` for
   return series only (`risk.ts`, `contribution.ts`, `decision-returns.ts`,
   `explore.ts`, `workbench.ts`, `score/history.ts`, the `price_return_pct`
   trigger). Search the repo rather than this list; a second reader found two
   the first missed. Rebuild snapshots; `snapshot:verify` must still report
   zero alignment issues.
3. **Unsplice `adj_close`.** Factor-change detection on the overlap in
   `ingestBars`, refetching the whole series when it moves (no `close`
   discontinuity guard on this path); `bars:audit` factor-monotonic check;
   one-off full refetch of SPY, QQQ and the eleven holdings; then re-run the
   audit and quote the corrected SPY TR since 12 Aug in the November pass.
4. **Put the ingest on a clock that keeps time.** `pg_cron` → `pg_net` →
   `workflow_dispatch` at 03:07 UTC; keep the GitHub schedule as fallback; a
   freshness alert at 05:00 UTC; a one-line note in ADR 0006 with the measured
   lateness.
5. **Stop writing `data_completeness` signals**, add `scorer_runs`, delete the
   408 rows by migration. The inbox should say "why look now" again before the
   prints generate the real signals.
6. **Dossier status follows the book** — the trigger or the ritual-7
   instruction, plus a one-off promotion of the nine held `investigate` rows.
7. **`knowable_at = least(estimate, observed_at)`** with a reproject and the SQL
   assertion.
8. **Revoke the preview grant** (SQL now; the grants page can wait).
9. **Holiday calendar** — start it this sprint if 1–5 land early; otherwise it
   is the first item of the next one, and it must be live before 26 Nov.
10. **Docs:** `plan.md` migration status and counts; runbook status through
    phase K; `README.md` reviews table (done with this review).

**Process, not code.**

- Before each Q3 print task comes due, add to its `instructions` the numbers
  plan item 17 asks for — what the print must show for the thesis to be on
  track, and what would trigger a `reduce`. Write them before the print, so the
  review after it is graded against a prior rather than a reaction. MRCY's
  (~3 Nov) is the one that matters most.
- Grade nothing at 90 days before 10 Nov; when it starts, publish the grade
  distribution in the November pass and spot-check five.
- The 1 November monthly pass should pick N for the relative-return clause
  (the 1 October one did not) and record the weekly-cadence count for October.
- Back up the published GPT instructions (runbook phase I) before the
  retirement date, independent of whether anything else about the GPT is
  done.

**For the mandate (operator decisions, unchanged since 19 Sep):** (a) whether
the Phase-1 → 2 transition requires a relative-return proof, and N; (b) what
the next identical diagnostic must do differently — the count and a
falsifier, as ritual text; (c) cost or market for rule 1; (d) the public-book
decision, which §1.1a makes less abstract.

---

## 12. Live inventory (measured 2026-10-13 11:16 Bangkok)

| Object | Count / state |
|---|---|
| Instruments | 58 (11 `active`, 47 `watchlist`, 0 `archived`); +TT, ITRI, VICR since 18 Sep; all USD |
| Positions | 11 open, 0 closed |
| Transactions | 12 (1 deposit, 11 buys, 0 sells, 0 dividends); 9 with `planned_action_id`, 0 with `client_key` |
| Decisions | 87 (68 hold, 14 enter, 5 watch, **0 reduce/exit**); last 10 Oct |
| Decision outcomes | **44**, all `horizon_days = 30`, 44 distinct decisions; 0 owed; 3 `no_fill`; first 90-day due 10 Nov |
| Review tasks | 108 (79 pending, 28 completed, 1 cancelled); scope: 68 company, 18 macro, 13 theme, 9 portfolio; pending triggers 56 `event_window`, 22 `scheduled`, 1 `condition` |
| Portfolio rituals | Monthly 2026-10 and Quarterly 2026-Q3 completed; 2026-11 and 2026-Q4 rolled |
| Planned actions | 12 (9 confirmed buys, 1 deferred MRCY add, 2 cancelled); **0 pending** |
| Signals | 483 (**408 `data_completeness`**, 44 crowding, 16 new quarter, 15 price); all status `new` |
| Dossiers | 56 of 56 names; 51 investigate, 5 active_thesis (MU, BWXT, CRDO, CEG, NOVT); 174 versions, 65 since 18 Sep; 0 unlinked sources; 0 past `next_review_at`, 17 null |
| Documents | **0** |
| Fundamentals | 2,568 vintages (2,407 filing-dated, 161 estimated, **21 dated after their observation**); 2,192 projection rows |
| Scorer setups | 56 as of 9 Oct; 0 stale; 43 complete, 13 partial; 5 `dataGap` |
| Market bars | 65,872; newest 2026-10-09 for SPY, QQQ and every holding; expected session 2026-10-12 at review time |
| Snapshots | 42 sessions 12 Aug → 9 Oct; all `as_of` 22:30Z; 0 alignment issues; 0 stale |
| Agent idempotency keys | **156**, all MCP, all `200`, first 1 Oct |
| OAuth | 1 client (ChatGPT); 2 live refresh tokens (production read-write; preview read-only, unused) |
| App users | 1 operator, 2 viewers |
| NAV / cash / invested / MV | $249,639.88 / $213,533.39 / $36,466.61 / $36,106.49 |
| Deployed sleeve | −5.9% since inception (unitized); DD 7.4%, max 17.0% |
| Scheduled ingest | 03:07 cron arriving 09:03–10:24 UTC; 05:07 retry 10:19–11:54 UTC; 6 manual dispatches in 11 days |
| Tests | 694 passing / 72 files; typecheck clean; tree clean at `58549c2` |

The `bars-if-stale` retry has now had three weeks of scheduled mornings: it
ran every day and never found work, which answers the question the 18 Sep
review left open — the vendor lag is closed. The scheduler lag replaced it.
