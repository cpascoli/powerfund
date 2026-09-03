# Power Fund — Full Project Review

**Date:** 2026-09-02
**Reviewed against:** live hosted Supabase project (`vctpghpvtyabbogquuim`) and the 2026-08-13 reviews
**Scope:** capital roadmap, software roadmap, structure/process/workflow, gaps and bugs, tests, watchlist and dossiers, decision audit trail, webapp UX/IA
**Prior reviews:** [2026-08-13 full review](./2026-08-13-full-review.md), [2026-08-13 strategy second opinion](./2026-08-13-strategy-second-opinion.md)
**Method:** read `docs/`, `architecture/`, `supabase/`, `apps/web/src`, `apps/worker/src`, `packages/*`; ran `pnpm typecheck` (clean) and `pnpm test` (38 files, 199 assertions, all pass); queried the live hosted project read-only; ran `verify_book_against_ledger()` against production; independently reconstructed the NAV and deployed-sleeve series from `transactions` + `market_bars` and compared it with the published `/api/v1/performance`.

---

## 1. Verdict

Software Phase 1 is now a working PM desk. Capital Phase 1 is collecting real process evidence, not racing the $75k cap. The hole that has not closed since 13 August is still **edge**: the system organises the operator well, and it is not yet systematically early.

In three weeks the product went from a bookkeeping shell to a loop that is actually run: ledger, mandate gates, briefing, calendar, agent API, weekly holds, a written 15% sleeve diagnostic, and a monthly pass. The live book also answered the 13 August allocation critique — robotics and generation now have starters.

What has not moved is the original strategic gap: point-in-time fundamentals, a scorer that is *used* rather than shadowed, and decision-grade valuation zones. Coverage is no longer the problem. Decision-grade is.

| Metric | 13 Aug | 2 Sep |
|--------|--------|-------|
| Invested cost | ~$18.5k | **$24,500** (32.7% of $75k cap) |
| Open names | 5 | **7** (added VST, ISRG) |
| Cash | $231.5k (92.6% NAV) | **$225,500** (91.3% NAV) |
| NAV | ~$250k | **$246,888** (−1.3% vs $250k allocated) |
| Sleeve vs peak | n/a | **−16.4%** true, **−18.1% published** (see §1.1) |
| Journal | 1 row | **38 rows, 0 outcome grades** |
| Review tasks | 0 | **27** (16 open) |
| Dossiers | 17 | **53** (102 versions) |
| Signals | 0 | **107, all `status=new`** |
| Tests | 0 | **38 Vitest + 3 SQL** (2 wired into `db:test`) |
| Viewer accounts | 0 | **2** |

Headline numbers at the last completed US cash session (2026-09-01 close). Source: live book.

### 1.1 Headline finding — the performance series is wrong, and it is the series the kill-switch reads

This is the most serious thing in this review and it was not caught by 199 passing tests.

**What is published right now** on `powerfund.netlify.app/api/v1/performance`:

| Metric | Published | True (reconstructed) | Error |
|--------|----------:|---------------------:|------:|
| Deployed TWR since inception | −16.7% | **−15.0%** | 1.7pp |
| Current deployed drawdown | 18.1% | **16.4%** | 1.7pp |
| **Max deployed drawdown** | **25.1%** | **16.4%** | **8.7pp** |

The 25.1% peak-to-trough drawdown **never happened**. The book's worst sleeve drawdown was ~16.4%. The true series was rebuilt independently from `transactions` + `market_bars` on the SPY session calendar; the correct daily path never falls below index 0.8636 (24 Aug and 28 Aug), while the stored series prints 0.7611 on 28 Aug.

**Two independent defects combine.**

*Defect A — snapshots are stamped with wall-clock run time, not the session they mark.*
`snapshotPortfolio()` sets `as_of = new Date()`, and `snapshot_date` is a generated column over that timestamp. It then marks every position with `latestClose()` — *the newest bar for that instrument, whatever its date*. The GitHub Actions cron is `0 22 * * 1-5`, but GitHub delays scheduled workflows, and the evidence is in `ingested_at`:

| Session | Bars ingested at | Snapshot `as_of` | Row labelled |
|---------|------------------|------------------|--------------|
| 26 Aug | 27 Aug 02:48 UTC | 27 Aug 02:48 | **27 Aug** |
| 27 Aug | 28 Aug 05:54 UTC | 28 Aug 05:55 | **28 Aug** |
| 28 Aug | 29 Aug 03:27 UTC | — (Saturday, skipped) | — |

So the row labelled 27 Aug holds the 26 Aug marks, and the row labelled 28 Aug holds the 27 Aug marks. This is exact, not inferred: the stored 27 Aug `positions_value` is 16,265.41 and the independently computed 26 Aug session value is **16,265.41**; the stored 28 Aug value is 16,553.63 and the computed 27 Aug session value is **16,553.63**. `backfillMissingSnapshots` then sees 26 Aug "missing" and reconstructs it from the same closes — which is why **26 Aug and 27 Aug are byte-identical** (`positions_value` 16,265.41 on both). The whole NAV history shifts by one day whenever the cron slips past midnight UTC, and the backfill never repairs it because it refuses to overwrite an existing row.

*Defect B — ledger flows and snapshot content are bucketed on different clocks.*
`accumulateLedgerFlows` buckets a fill by the **UTC day of `occurred_at`**. The VST buy occurred 28 Aug 15:29 UTC → flow lands on 28 Aug. But the row labelled 28 Aug was written at 05:55 UTC that morning, *before* the fill. The daily return therefore computes `16,553 / (16,265 + 3,000) − 1` = **−14.1%**, a loss that did not occur, followed by a compensating phantom **+11.6%** on 31 Aug. That single fabricated day is the entire 8.7pp drawdown error.

**Why it matters beyond the number.** This series is what `computeDrawdown` → `killSwitchBreached` → mandate rule 8 reads. The 30 Aug ritual-11 diagnostic was written off it (it recorded ~15.3%). The breach itself was real — the true drawdown is 16.4%, above the 15% threshold — so the *decision* was right and the process behaved well. But the magnitude was wrong, the published max drawdown is fiction, and the same defect will fire the kill-switch spuriously on any future fill day where the cron runs late. After capital Phase 1 that flag becomes a **buy halt**.

**Fix.** All the parts already exist in the repo:

1. Stamp the snapshot from `lastCompletedCashSession()` (`@powerfund/domain/dates`), not `new Date()`. The web app already uses it for `price_data_stale`; the worker does not import it.
2. Mark only with bars whose `bar_date` equals that session; if a name has no bar for it, fail the snapshot or record the mark as stale — do not silently reuse an older close (`staleMarks` today only catches a *missing* close, never an *old* one).
3. Bucket ledger flows on the same session key, not `utcDay(occurred_at)`.
4. Let the backfill **overwrite** rows whose marks predate their label, and delete the duplicated 27 Aug row.
5. Add an invariant test: for every snapshot, the bar dates behind the marks equal `snapshot_date`. That is the test class that is entirely absent (see §7).

Until this is fixed, treat every `deployed_*` number on the site, in `getPerformance`, and in the monthly pass as indicative only.

---

## 2. Two roadmaps

Same phase numbers, different objects. The docs no longer confuse them. Practice mostly honors the split: VST and ISRG were bought because the process ranked them, not because a feature shipped.

| Plan | Status | Read |
|------|--------|------|
| **Software Phase 1 — Research OS** | In progress, ~85% | Weekly process *can* run through PowerFund. Filings on dossiers, signal inbox CRUD, and valuation zones are still open. |
| **Software Phase 2 — Data & quant** | Input layer + shadow scorer | EOD bars and fundamentals run. Exit criterion (a non-price scorer *used* in production) is not met. |
| **Software Phase 3 — Risk** | Minimum slice live | Workbench → Risk plus buy-gate caps. Correlation is display-only, not a pre-capital block. |
| **Software Phase 4** | Not started | Correctly optional. |
| **Capital Phase 1 — Seed $0–$75k** | Current | Evidence collection. Cap nowhere near. All four core themes now have a starter. |
| **Capital Phase 2+** | Not authorized | $150k / ~$225k remain proposals. |

---

## 3. Capital roadmap

### 3.1 Live book (1 Sep 2026 close)

Cash **$225,499.97**. NAV **$246,888**. Invested cost **$24,500**. Unrealized **−$3,112** (−12.7% on cost). Marks from `market_bars` last close.

| Name | Theme | Cost | Mark | P&L | Kill criteria | Last journal |
|------|-------|-----:|-----:|----:|---------------|--------------|
| VRT Vertiv | AI infra | $5,000 | $4,316 | −13.7% | Yes | 30 Aug hold |
| CLS Celestica | AI infra | $5,000 | $4,200 | −16.0% | Yes | 30 Aug hold |
| NVT nVent | AI infra | $4,500 | $3,878 | −13.8% | Yes | 30 Aug hold |
| ISRG Intuitive | Robotics | $3,000 | $2,962 | −1.3% | Yes | 31 Aug enter |
| VST Vistra | Energy | $3,000 | $2,958 | −1.4% | Yes | 28 Aug enter |
| MRCY Mercury | Defence | $2,500 | $1,895 | −24.2% | Yes | 1 Sep hold |
| NBIS Nebius | AI infra | $1,500 | $1,180 | −21.4% | Yes (rule-6 note) | 30 Aug hold |

Theme mix of invested cost: AI infra **$16.0k (65%)**, energy **$3.0k (12%)**, robotics **$3.0k (12%)**, defence **$2.5k (10%)**. All four core themes represented. That was a Phase-1 → Phase-2 gate item and a hole in the 13 August strategy note.

AI-capex factor vs NAV is still small (~6%) because cash is 91% of the book. Theme labels still overstate diversification among the *deployed* dollars: VRT, CLS, NVT, and NBIS remain one hyperscaler-capex complex.

### 3.2 NAV and the 15% sleeve diagnostic

Weekday snapshots (`portfolio_snapshots`):

| Date | NAV | Deployed (marks) | Invested cost |
|------|----:|-----------------:|--------------:|
| 12 Aug | 249,862 | 4,862 | 5,000 |
| 13 Aug | 249,857 | 18,357 | 18,500 |
| 17 Aug | **250,166** (NAV peak) | **18,666** (sleeve peak) | 18,500 |
| 24 Aug | 247,362 | **15,862** (−15.0% sleeve) | 18,500 |
| 28 Aug | 248,054 | 16,554 | 18,500 |
| 31 Aug | 247,313 | 21,813 | 24,500 |
| 1 Sep | 246,888 | 21,388 | 24,500 |

The 15% deployed-sleeve diagnostic fired. Book-level classification (30 Aug portfolio task): valuation / factor compression, not thesis failure. NAV drawdown was only ~1.2% because cash is the ballast. Per-name invalidation did not trigger. New buys were not halted (capital Phase 1). VST and ISRG were then deployed into the tape. That is the mandate’s intended response, and it was written down.

**Read the table above with §1.1 in mind.** The rows are labelled by job run time, not by session: 27 Aug duplicates 26 Aug, and the row labelled 28 Aug is the 27 Aug close taken before the VST fill (cash still $231.5k, invested still $18.5k). The correct session-aligned sleeve path is:

| Session | Sleeve mark | Flow | Day return | Index | Drawdown |
|---------|------------:|-----:|-----------:|------:|---------:|
| 17 Aug | 18,666 | — | +1.11% | 1.0166 (peak) | 0.0% |
| 24 Aug | 15,862 | — | −1.24% | 0.8638 | 15.0% |
| 27 Aug | 16,554 | — | +1.77% | 0.9015 | 11.3% |
| 28 Aug | 18,731 | +3,000 | −4.21% | 0.8636 | 15.1% |
| 31 Aug | 21,813 | +3,000 | +0.38% | 0.8668 | 14.7% |
| 1 Sep | 21,388 | — | −1.95% | 0.8500 | **16.4%** |

Peak was 17 Aug; the sleeve has been below the 15% diagnostic line on and off since 24 Aug and is currently 16.4% below the high-water mark. That is a genuine breach and the diagnostic was correctly written. The 25.1% max drawdown the site publishes is an artefact.

Separately, the book itself reconciles exactly: `verify_book_against_ledger()` run against production during this review returns **15/15 checks OK** (cash, and quantity + basis for all seven names). The August ledger work has held. The defect is in the *marking* layer, not the *accounting* layer — which is the good version of this problem.

### 3.3 Capital Phase 1 evidence scorecard

Mandate question: can we `research → decide → size → deploy → monitor → invalidate → review`, repeatedly, without breaking our own rules? Not: did $24.5k beat the S&P.

| Proof | Status | Evidence |
|-------|--------|----------|
| Selection | Improving | VST over CEG on expected return; CRDO print-gated; MRCY add cancelled then re-deferred at $75 |
| Sizing | Pass | Starters $1.5–5k; no name above ~2% NAV; Phase-1 cap nowhere near |
| Anti-chase | Mixed | SNDK deferred after an `enter` was already journaled; NBIS still the original rule-6 exception |
| Volatility | Pass (this episode) | Sleeve classified as valuation/factor; ladder not frozen; ISRG/VST deployed into the correction |
| Journal grades | **Fail** | 38 decisions, 0 `decision_outcomes`. No process-vs-outcome distinction yet |
| Operations | Mostly pass | Holds, catalysts, diagnostic, and a monthly pass ran through PowerFund, not chat-only |

There has still been **no reduce, sell, or exit**. Phase 1 cannot yet prove invalidation discipline beyond “we wrote kill criteria.” The first exit will also be the first production test of the sell path.

### 3.4 Deployment pace

August front-loaded ~$18.5k in two days, paused through the sleeve drawdown, then added $6k (VST + ISRG). The 1 Sep monthly pass kept the ~$10k September baseline and explicitly did not accelerate. That is coherent with the ladder.

Cash at 91% becomes a **written decision at the second consecutive monthly pass** (ritual 6), not a mood. October is the first month that test can fire.

### 3.5 13 August strategy findings — scored

| Then | Now |
|------|-----|
| Robotics $0 while GPU cloud was bought | ISRG $3k starter. Theme hole closed. Still one name, procedure-volume not hyperscaler. |
| Generation/grid $0 despite #1 conviction | VST $3k. CEG still watch-only. Energy is no longer a research-only sleeve. |
| Four themes, one AI-capex factor | Risk view exists. Factor map last reviewed 16 Aug. Seven later names unclassified. |
| Kill-switch vs stretch CAGR | Docs now match: 15% is a diagnostic in Phase 1; software halt only after $75k. |
| Momentum labeled as early | Still mostly true of the AI-infra core. Dossiers are better; valuation-zone fields still missing. |

---

## 4. Software roadmap

### 4.1 Phase 1 — Research OS

Exit criterion: the weekly investment process runs entirely through PowerFund. Tooling now supports that. Habit is close. A few product holes still force work into chat or markdown.

| Build item | `plan.md` | Reality |
|------------|-----------|---------|
| Watchlists / dossiers / journal / book / queue | Done | Live and used |
| Agent API + operating rituals | Not a Phase 1 checkbox | **Done; this is the real Phase 1 closer** |
| Briefing Dated / Due / Research | Weekly ritual open | Surface exists; weekly holds still awkward to complete |
| Filings/earnings on dossiers | Open | `documents` table empty; unused |
| Signal inbox CRUD | Open | 107 automated rows, all `new`; no manual CRUD |
| Valuation zones (ritual 9) | Open | No schema field; September ranking lived in a second task |
| `fundamental_inflection_v1` | Shadow, not buy-gated | Accurate — Explore + Signals only |
| Workbench Risk (Phase 3 pull-forward) | Done 14 Aug | Correlation, crowding, −20% capex stress — display, not a buy block |

### 4.2 Phase 2 and 3

**Phase 2.** EOD bars (63.6k rows, latest US session 2026-09-01), weekly fundamentals (1,491), GitHub Actions ingest, and a shadow inflection scorer. The plan’s own pipeline is still `ingest → (missing normalize / vintages / features) → unused alerts`. 107 signals with `status=new` means the loop is not routine.

**Phase 3.** Buy gate enforces position / theme / cash / Phase-1 / AI-capex / memory sleeves with a written override. Kill-switch is diagnostic in Phase 1, halt after. Correlation is not a pre-capital block. Memory sleeve is a **hard gate in code** despite a “soft guide” in the mandate.

### 4.3 Prior review — P0/P1 closure

Against [2026-08-13-full-review.md](./2026-08-13-full-review.md):

| Bucket | Closed | Open or partial |
|--------|--------|-----------------|
| Security P0 (signup, RLS, anon grants, fail-closed middleware) | 4 | 1 (SEC-6: `requireOperator` in UI; 2 viewers now exist) |
| Book P0/P1 (ledger, sells, snapshots, mandate gate) | 6 | 1 (first live sell unexercised) |
| Data Sprint 2 (vintages, `price_basis`, ingest_runs, SEC purity) | ~1 | **Mostly unstarted** |
| Edge Sprint 3 (signal inbox, filings, features, weekly ritual) | Shadow scorer | Filings, CRUD, valuation zones, ritual completion UX |
| Hygiene (tests, CI) | Tests exist | **No PR CI**; `review_tasks.sql` not in `db:test` |

The 13 August P0 security and ledger work stayed closed. Sprint 2 (vintages, `price_basis`, ingest run records) **has not started**. That remains the cheap-now / expensive-later gate on any honest scorer.

Still the right open list:

| ID | Sev | Item |
|----|-----|------|
| DATA-1 | P0 for edge | `fundamentals_quarterly` has no `filed_at`; restatements overwrite |
| DATA-2 | P0 | Stooq `adj_close` = raw close mixed with Tiingo/Yahoo adjusted |
| PROD-1 | P1 | Signal inbox is a transition log, not CRUD |
| PROD-3 | P1 | Weekly ritual surface exists; completion path is agent/journal gymnastics |
| HYG-2 | P1 | No PR CI; only `.github/workflows/scheduled-ingest.yml` |
| SEC-6 | P1 | 2 viewer accounts exist; UI still shows mutation controls |

---

## 5. Structure, process, and workflow

The object taxonomy in [gpt-agent-process.md](../gpt-agent-process.md) is the right one, and both the product and the operator are mostly following it.

```text
Themes → Explore (names) → Dossier versions
                ↓
         review_tasks (Dated) → Briefing Due
                ↓
    decisions (Journal) ← human approval
                ↓
    planned_actions (queue) → Portfolio confirm fill → transactions
                ↓
         portfolio_snapshots / performance
```

- **Agent** creates/updates dossiers, decisions, planned actions, review tasks; **never** books fills.
- **Human** confirms fills in Portfolio.
- **Briefing sweep** = Dated this week → Due. Research is a backlog.
- **Weekly holds** = new `createDecision` (`hold`), not review tasks.
- **Calendar** = public catalyst catalog; operator past = completed reviews (Book / Condition).

This is a genuine operating system. The 13 August complaint that “the weekly process cannot run through PowerFund” is no longer true.

Process breaks that *are* true:

1. **September spawned two portfolio tasks** — `September 2026 Monthly Book / Mandate Pass` and `September 2026 Opportunity Ranking`. Rituals 6 and 9 are one task. A second ranking row splits the archive the monthly pass was invented to keep. October is already titled `Monthly book pass — 2026-10` — keep it that way.
2. **No quarterly** `Quarterly book review — 2026-Qn` task exists. Calendar fill is supposed to create one if none sits in the next ~4 months. Rituals 10 and 12 have no home.
3. **Holdings remain `instruments.status = watchlist`.** Explore and the agent watchlist treat owned names as research stubs. Fill never promotes to `active`.
4. **Weekly holds sometimes are cloned diagnostic paragraphs** pasted onto five names (24 Aug and 30 Aug). Legal for the 7-day clock; weak as per-name thought.

---

## 6. Gaps, inconsistencies, coding bugs, unaccounted risks

### 6.1 Process inconsistencies

| Finding | Why it matters |
|---------|----------------|
| Two September portfolio tasks for one monthly pass | Splits the book-level archive |
| No quarterly review task | Rituals 10/12 have nowhere to persist |
| Holdings stay `watchlist` | Owned names look like research stubs |
| SNDK has an `enter` decision and no fill; queue later deferred | Journal says we initiated. The book did not. |
| VST and ISRG each have two `enter` rows (intent + fill) | `createDecision` on plan, then another on confirm, doubles enter history |

### 6.2 Mandate vs code

| Rule | Doc | Code |
|------|-----|------|
| Max position | Cost and/or market — **never chosen** | Market value vs NAV |
| AI memory sleeve 15% | Soft guide | **Hard block** in `evaluateProposedBuy` |
| Kill-switch 15% | Diagnostic in Phase 1; halt after | Matches. Tested. |
| Factor map | Unknown names flagged | True — but APH, FIX, FN, MOD, CW, CGNX, SYM are unclassified |

`$250k` still lives in SQL seed/migrations; `$75k` lives in `@powerfund/domain`. Changing caps still means touching multiple sources.

### 6.3 Coding and data bugs

| Sev | Area | Issue |
|-----|------|-------|
| **P0** | Snapshots / performance | Session-vs-run-time mislabelling and flow misalignment corrupt the NAV and sleeve series. Full diagnosis and fix in **§1.1**. |
| **P1** | FX — none exists | **SKHY is stored as `exchange: 'US'`, `currency: 'USD'` while every number attached to it is KRW**: close ₩1,623,000, market cap ₩1.14T, revenue ₩52.6T (written to `fundamentals_quarterly.currency = 'USD'`, hardcoded — DATA-15). It also carries a 2 Sep bar because the Seoul session closes first. Nothing on the fill path checks currency, so buying SKHY would mark the position at "$1,623,000/share", blow past every cap, and corrupt NAV. It has a verified dossier and sits in the research universe today. Either add an FX/currency guard on `bookFill` and the mandate gate, or restrict the universe to USD listings until FX exists. |
| **P1** | Benchmarks mislabelled | `BENCHMARKS` calls SPY "S&P 500 **TR**" and QQQ "Nasdaq-100 **TR**", and `mandate.md` requires *total-return* indices — but every bar is Yahoo with `adj_close == close` (all 51k rows sampled), i.e. **price return, no dividends**. The fund is measured against a benchmark that is understated by ~1.2%/yr (SPY) and ~0.5%/yr (QQQ). Negligible over three weeks; it systematically flatters the track record over the multi-year window the mandate wants to judge. Fix the label or the data. |
| **P1** | Market-holiday calendar | `lastWeekdayOnOrBefore` in `@powerfund/domain/dates` has no holiday calendar ("Weekends only — no holiday calendar" is in the docstring). On every US market holiday `priceDataStale` is true all day, so `getCompanyDossier.price_data_stale` fires and **ritual 8 step 2 tells the agent not to pass the data-integrity gate** — the buy gate self-blocks ~9 days a year. `market_bars` for the SPY benchmark is already used as a trading calendar in `snapshot/backfill.ts`; use it here too. |
| **P1** | `updatePlannedAction` | A `cancelled` action can be set back to `pending` (`if (!OPEN_STATUSES.has(row.status) && input.status !== "pending") throw` — "pending" is the exemption), and the mandate gate only re-runs when `planned_usd` or `action_type` changes. A cancelled buy that would now breach a cap can be revived ungated. |
| **P2** | `withActor` double-prefix | `updatePlannedAction` prepends `[agent:${actor}]` to `row.rationale` when `input.rationale` is undefined, so each PATCH stacks another tag. Two live rows already read `[agent:chatgpt] [agent:chatgpt]`, and the tag has leaked into `positions.thesis_summary` for VST. Prepend only when the text does not already start with the tag. |
| **P2** | Signals are 65% noise | `inflectionTransitionCause` returns `data_completeness` when only `completeness`/`stale` changes, so a signal is written with no setup change. **70 of 107 rows are `X → X`** ("POWL: Needs thesis check → Needs thesis check"), 82 have cause `data_completeness`. The one surface meant to answer "why look now" is dominated by non-events and grows ~53 rows per run. Only write a signal when `setup` or `fundamentalState` actually changes; log completeness churn to the setup row, not the inbox. |
| **P2** | `bookFill` retry | After the ledger insert succeeds, a failure in the position read-back, decision link, or `copyEnterInvalidationToPosition` returns `{ ok: false }` while the money has already moved. Queued fills are protected by the `planned_action_id` unique index; **unplanned manual fills are not** — an operator retry double-books. |
| **P2** | `listDecisions` unbounded | No `limit`, and the Briefing loads it on every render. At 1,000 rows PostgREST silently truncates and `thesis_review` detection starts missing names — the same 1,000-row cap that already bit the price chart. |
| **P2** | `instruments.status = 'active'` is dead | The enum has it, nothing ever writes it, and only `'archived'` is read (as an exclusion). There is also **no archive path in the UI or the agent API**, so ritual 5 (watchlist hygiene) is unimplementable across 53 names except by raw SQL. |
| **P2** | Undocumented `macro` scope | `review_scope` includes `'macro'` and **8 of 27 live tasks use it**, but `gpt-agent-process.md` and `agent-api.md` document only company/theme/portfolio. Macro tasks are treated as public catalysts by `isPublicCatalyst`. Nearly a third of the calendar sits in a scope the operating process never defines. |
| P2 | Ingest | Vendor date semantics still mixed; DATA-2 unfixed in code even though every current row is Yahoo — a Stooq fallback would silently write raw closes into `adj_close` with no `price_basis` to tell them apart. |
| P2 | SEC parser | Annual-duration facts with non-FY `fp` can land in quarterly series (DATA-7). Untested. SNDK's latest quarter has `revenue = null`, so its scorer input is empty while a $4k starter sits in the queue. |
| P2 | Valuation | `positions.side` is ignored; a short would add to NAV. Latent. |
| P2 | Agent idempotency | `agent_idempotency_keys` has **0 rows** despite many `[agent:chatgpt]` writes. Retries can duplicate decisions. |
| P2 | `apply_transaction` | `SECURITY DEFINER` with `EXECUTE` granted to `PUBLIC`. Trigger-shaped, but the advisor flags it; 2 viewers now exist. |
| P2 | Agent error bodies | `handleAgentRequest` returns the raw `Error.message` as `INTERNAL_ERROR`, so Postgres text reaches the caller. |
| P3 | Rate limiting | `rateLimit` is an in-process `Map`. On OpenNext/Netlify each lambda instance has its own, so the public 60/min cap is not actually enforced now that the site is open by URL. |
| P3 | `review_due` UI | Fired review tasks have `href: null`. No in-app complete. Agent-only write. |
| P3 | `review_tasks.sql` | Exists, not wired into `pnpm db:test`. |
| P3 | `computeDrawdown` NAV | `navDrawdownPct` uses a raw NAV peak while `getPerformance` uses the unitized NAV index. The two surfaces can disagree after any deposit or withdrawal. |

### 6.4 Risks not in the mandate

| Risk | Note |
|------|------|
| Coinbase commingling | Still true: $250k is a policy carve-out next to BTC/gold. Ledger cannot see a BTC buy from the same dollars. |
| Viewer accounts (2) | Read surface still includes dollars, journal, and the deployment queue. Front-running material if those accounts are friends. |
| No sell has ever been booked | Sell path exists in SQL and UI and is unexercised in production. |
| Shadow scorer as comfort | 107 unscored-by-human rows can feel like coverage. They are not in Briefing or the buy gate. |
| **Publishing the book has never been a written decision** | The site is now open by URL and `/api/v1` publishes weights, the journal **including invalidation levels**, the catalyst calendar, and a performance record. `agent-api.md` documents the surface; the *mandate* does not. `mandate.md`'s compliance note says published signals for others are capital Phase 4 — a read-only historical book is plausibly not that, but the line is close enough that the decision belongs in the mandate or an ADR rather than in a commit message. It also means §1.1's wrong drawdown is public, not private. |
| **No currency dimension anywhere** | The book, the caps, and NAV all assume USD. The universe no longer does (SKHY). See §6.3. |
| **Data-integrity gate self-blocks on US market holidays** | `priceDataStale` has no holiday calendar, so ritual 8 refuses the gate roughly nine days a year. Enough friction to train the operator to skip the gate. |

---

## 7. Tests

From zero on 13 August to **38 Vitest files** under `apps/web` plus 3 SQL suites. `packages/domain` has no in-package runner (logic is exercised via web imports). `apps/worker` and `packages/data-clients` have essentially no tests (one Yahoo fundamentals test lives in web).

**Sensible (high signal):** domain TWR / drawdown / sleeve-flow; contribution math; briefing Due vs Mandate kill-switch; `ledger.sql` including the static `safeupdate` guard; inflection fixtures; agent mutation guards (no fills).

**Tautological / shallow:** public-surface key checks; some OpenAPI shape tests; `createDecision` return-shape without asserting the pin payload.

**Missing (would pass while production fails):**

- `bookFill` / `sellPosition` against real Supabase (RLS, triggers, confirm idempotency)
- Vendor ingest (adj_close continuity, SEC quarter purity)
- `mandateGate` + `loadMandateBook` end-to-end
- `evaluateStoredReviewTriggers` / `loadMarketObservation`
- PR CI — tests and typecheck are manual; scheduled ingest is the sole workflow

The 13 August lesson still applies: a test that runs as `postgres` proves SQL logic, not that the app can execute it. The static `WHERE` scan on `pg_proc` is the right response to `safeupdate`; it does not replace an app-layer fill test.

**The sharper lesson from §1.1.** 38 files and 199 assertions pass while production publishes a 25.1% drawdown that never happened. `performance-math.test.ts` and `snapshots.test.ts` are good tests — but every fixture is hand-built so that `sleeveFlow` and `positionsValue` already agree on the same day. They verify **the math given well-formed inputs**. Nothing anywhere verifies **that the inputs are well-formed**, and that is exactly where the defect lives. `apps/worker` — which writes those inputs — has zero tests.

The missing test class is *invariants over the stored data*, not more unit tests:

- every `portfolio_snapshots` row's marks come from bars dated `snapshot_date` (would have caught both defects);
- no two consecutive snapshots are byte-identical in `positions_value` with a non-zero market move;
- every `transactions` sleeve flow falls on a day whose snapshot already contains the resulting position;
- `verify_book_against_ledger()` returns all-OK — it exists, it passes, and **nothing runs it against production**. It appears once in `supabase/tests/ledger.sql` and never in the app, a cron, or CI.

Wire that last one into the nightly job and surface a failure as a Briefing flag: it is the cheapest possible guard on the thing that matters most.

There is also still **no PR CI at all** — `.github/workflows/` contains only `scheduled-ingest.yml`. `pnpm test` runs the web workspace only (`packages/*` have no test script), `pnpm lint` lints nothing (four workspaces echo a stub; `apps/web` runs `next lint` with no eslint dependency and no config), and `pnpm db:test` needs Docker and is manual. `pnpm typecheck` and all 199 tests pass today — by hand.

---

## 8. Watchlist and dossiers

55 instruments (53 themed + SPY/QQQ). 53 dossiers, 102 versions. Almost every research name has a write-up. Coverage is no longer the problem.

| Theme | Names |
|-------|------:|
| AI infrastructure | 25 |
| Energy | 10 |
| Robotics / AI | 9 |
| Defence | 9 |

Dossier status: **1 `active_thesis` (CRDO) / 52 `investigate`**.

### What is actually good

- **CRDO** — 5 versions, only `active_thesis`, verified 2 Sep after Q1 FY27. Planned $3k with `price_at_or_below:195` / `no_chase_above:205`. Ritual 8 in the wild.
- **MRCY** — 5 versions, 10-K + insider filings folded in, weekly hold the same day. Print → cancel add → re-defer at $75 is the template.
- **NBIS** — financing settlement reviewed, dilution named, sized as optionality. Matches the original chase stain without repeating it.
- **ISRG** and **VST** — reads answer “why this, why now, why starter.”
- Invalidation exists on every open position — mandate rule 4 is no longer theater.

### Where the watchlist is weak

| Name | Issue |
|------|-------|
| **AVGO** | `verified_at` 30 Aug but thesis is **211 characters**. Summary is long; the thesis field is a stub. Review date 2 Sep — due the day of this review — with no decision-grade body. |
| **IREN** | `next_review_at` 28 Aug, **overdue**. Contracted Microsoft/NVIDIA story; review clock ignored. |
| **NVDA** | `next_review_at` 27 Aug, **overdue**. Theme-defining name with a stale diligence date. |
| **VRT / CLS / NVT** | Live dossiers last written **15 Aug**. Journal has four later holds. Process allows that if the thesis did not change — but 18-day-old `verified_at` on the three largest positions is stale for ritual 8. |
| **APH, FIX, FN, MOD, CW, CGNX, SYM** | On the watchlist, have dossiers, **missing from `FACTOR_EXPOSURES`**. A buy would trip `factor_unclassified` — good — but they should not have been added without a map row. |
| **OUST, AMBA, PATH** | Still the speculative robotics sleeve the 13 Aug note warned about. Fine as watch; do not size like ISRG. |

New names since the last review (APH, FIX, FN, MOD, CW, CGNX, SYM, CRDO deepening) are closer to the mandate’s “next bottleneck” hunt than another cooling vendor. The *owned* book is still 65% of invested cost in AI-infra names that load on hyperscaler capex. That is allowed in Phase 1. It is not diversification.

**Decision-grade bar (ritual 9).** Almost no dossier states Fair / Attractive / Dislocation / Panic vs thesis impairment as a field. Scenarios exist in prose for the better names (CRDO, MRCY, ISRG). The monthly ranking had to re-derive states from text. Until that is a structured zone vs `last_close`, “buy on dislocation” remains a chat skill, not a system property.

Measured against the dossier text: **24 of 53 use no valuation-zone language at all** (including VRT, CLS, SNDK, MU, GEV, PWR), and **34 of 53 contain no crowding metric** — no valuation percentile, short interest, 200-day extension, or revision breadth — despite mandate rule 6 saying crowding is "measured, not felt". The irony is that Workbench → Risk already computes 5-year valuation percentile and 200-day extension from `market_bars`; the number exists in the product and never reaches the dossier. Piping the computed crowding band into the dossier at save time is cheaper than asking the writer to type it, and it makes rule 6 auditable.

### Stale valuation anchors

30 dossiers state a machine-readable `**Valuation basis:** $X on <date>` in the summary. **13 of those 30 are now more than 10% away from the last close**, including three of the four largest positions:

| Name | Anchor | Anchor date | 1 Sep close | Drift |
|------|-------:|-------------|------------:|------:|
| KTOS | $74.46 | 21 Aug | $49.34 | **−33.7%** |
| NVT | $171.39 | 14 Aug | $147.30 | −14.1% |
| OUST | $38.42 | 21 Aug | $33.26 | −13.4% |
| VRT | $293.84 | 14 Aug | $255.97 | −12.9% |
| CLS | $335.05 | 14 Aug | $292.59 | −12.7% |
| IREN | $41.88 | 21 Aug | $36.82 | −12.1% |
| EME | $836.29 | 14 Aug | $735.25 | −12.1% |
| TDY | $503.63 | 21 Aug | $610.51 | **+21.2%** |

To be fair to the process: the 1 Sep ranking **did** re-price correctly — it quotes "unchanged scenarios imply ~24% annualized at ~$258.72", i.e. current price against unchanged terminal values, which is the right method. The problem is that the arithmetic lived in the GPT's context and the ranking prose, while the dossier a human opens still says $293.84 on 14 August.

That gap has a single root cause worth naming: **scenario values are not a stored object.** There is no field or table holding base/bull/bear values, probabilities, and horizons. So the app cannot recompute a probability-weighted return, cannot re-derive a correction-readiness state when the price moves, cannot check the arithmetic, and cannot flag anchor drift. Every month an LLM re-derives the numbers from prose and the result is trusted because it is plausible. Of everything in this review, structuring scenarios — `{value, probability, horizon}` rows plus the four zone thresholds — is the change that would most move the process from "a careful operator with a good assistant" toward "a system with properties". It also makes §8's whole staleness problem a computed flag instead of an audit finding.

---

## 9. Decisions and the audit trail

The object model is the right one: live dossier, immutable versions, journal pins, planned actions, review outcomes. Use is uneven. Pins work on later rows; the first five enters have no `dossier_version`. Outcomes were built and never used.

| Kind | Count |
|------|------:|
| Enter rows | 9 (7 fills — SNDK enter has no fill; VST/ISRG duplicated) |
| Holds | 26 |
| Watch | 2 (MRVL, BWXT) |
| Reduce / exit / grades | **0** |

### What the trail gets right

| Event | Trail |
|-------|-------|
| MRCY FY26 print | Hold the day of; $4k add cancelled; new deferred add at $75; condition review still open. Template quality. |
| NBIS financing 24 Aug | Event-window task completed with dilution named; later hold says hold-not-add. |
| 15% sleeve | Per-name holds on 24 Aug and a covering portfolio diagnostic on 30 Aug. Classification: valuation/factor. Due logic matches the mandate. |
| VST vs CEG | Company review completed 27 Aug; fill 28 Aug; rationale is relative expected return, not narrative loyalty. |
| CRDO | Planned $3k with price cap; Q1 task completed 2 Sep before entry. |

Open queue (honest labels): CRDO buy $3k pending (best-process open item); SNDK $4k deferred (reconcile the ghost enter); MRCY add ~$4k at $75 deferred + price condition.

### What the trail gets wrong

| Break | Fix |
|-------|-----|
| First five enters unpinned (pre-versioning) | Backfill pins from the earliest `dossier_versions`, or accept that week-1 is unauditable. |
| SNDK enter without a fill | Do not `createDecision enter` until the human confirms. `watch` or `planned_action` is the intent object. |
| Duplicate enters on VST and ISRG | Plan → confirm should pin the fill to the existing enter, not insert a second one. |
| Weekly holds that are cloned diagnostic paragraphs | Legal for the clock; weak as per-name thought. |
| Zero outcome grades | Ritual 12 cannot calibrate. Grade MRCY timing and the NBIS entry at the quarterly, even without an exit. |
| Monthly ranking as a second task | Put the rank table in `Monthly book pass — YYYY-MM` outcome. |
| Agent writes without idempotency | GPT is not sending (or not persisting) `Idempotency-Key`. A retried `createDecision` is how you get ghost holds. |

---

## 10. UX / IA — Briefing, Calendar, Journal

The split is right. Briefing is **Now**, Journal is **Then**, Calendar is the dated catalog plus outcomes, Portfolio is **capital**. That taxonomy is better than most research tools, and the copy on each page actually says it. Duplication is mostly projection of one record through different lenses — which is correct — not three sources of truth.

Do **not** fold Calendar into Briefing. Public Calendar without instructions, Research as a backlog tab rather than Due, and no agent fills are all keepers.

| Object | Briefing | Calendar | Journal | Portfolio |
|--------|----------|----------|---------|-----------|
| Planned trade | Dated / Due if due | — | — | Queue (confirm) |
| Catalyst review | Dated; Due when fired | Upcoming / Past | — | — |
| Book ritual | Dated / Due | Past as Book | — | Mandate flags |
| Weekly hold | Due as `thesis_review` | — | New decision | — |
| Research hygiene | Research tab | — | — | — |

### Remaining IA tensions (not taste)

1. **Weekly hold completion is the largest UX bug.** Due links the stale row; completion is a **new** Journal entry. Operators will grade the old enter and think they are done — which the API explicitly does not count. Due should CTA “Log this week’s hold” to `/decisions/new?instrument=`.
2. **Due-today planned actions appear on Dated and Due.** Acceptable if Due is the sweep and Dated is the week view. Make Dated drop items that are already on Due, or badge them “also Due” once. Two identical rows train people to ignore one inbox.
3. **The word “Review” means catalyst, book pass, and weekly hold.** Rename the weekly item “Weekly hold”. Keep “Review” for `review_tasks`. Calendar Past already says Book vs Condition — Briefing should match.
4. **Fired review tasks have no complete button** (`href: null`). Either an operator complete form, or a hard link into the GPT with the task id. A checklist you cannot check off is how Due rots.
5. **Calendar signed-in default = Past.** Archive-first is coherent with “not a todo list,” but operators opening Calendar to see AVGO tonight will think the page is empty. Default Upcoming; keep Past one click.
6. **Mandate flags on Due, Mandate tab, and queue.** Keep monitoring on Portfolio → Mandate. Due should only show flags that require a ritual (kill-switch diagnostic, missing invalidation). That rule already exists for drawdown; extend it to cap warnings.
7. **Journal URL `/decisions` vs nav “Journal”.** Cosmetic. Either alias `/journal` or live with it. Do not add a fourth noun.

### Density and navigation

The Operate / Research / Playbook grouping is coherent. Calendar under Research (catalog) and Briefing under Operate (work) is the correct answer to “is Calendar a zone or a tab?” — it is a zone.

Portfolio is the crowded page: Book, Queue, Mandate, Performance, Ledger, plus stat and viz sub-tabs. That is a lot, but each tab is a different job. Do not split Portfolio. Hide Ledger behind a disclosure for daily use.

Visual language is consistent (shared agenda table) to a fault: Dated, Calendar, and Journal look like the same list. A one-line purpose chip in the table header (“Work queue” / “Event catalog” / “Decisions”) would do more than another layout rewrite.

The product feels like a PM desk now, not a dashboard of the same NAV five times — which is what [ux.md](../ux.md) asked for.

---

## 11. Recommended sequence

**Now — the book is telling you things that are not true.**

1. **Fix snapshot session alignment and rebuild the NAV history** (§1.1). Stamp from `lastCompletedCashSession()`, mark only on that session's bars, bucket flows on the same key, let the backfill overwrite mislabelled rows, drop the duplicated 27 Aug row. Add the invariant test. Nothing else on this list matters as much, because the kill-switch, the published track record, and the monthly pass all read this series.
2. **Run `verify_book_against_ledger()` nightly** and flag failure on Briefing. It passes today; make that a fact you learn automatically rather than one someone checks during a review.
3. **Guard currency on the fill path** — or drop SKHY from the universe until FX exists. A KRW instrument with a verified dossier and no FX layer is one confirmed fill away from a corrupted book.
4. **Hide mutation UI from viewers and add `requireOperator()`.** Two viewer accounts exist and the read surface still includes exact dollars, the journal, and the deployment queue. The August review said to decide the viewer read surface *before* the first viewer; the viewers arrived first.

**Next — the gates on everything else.**

5. **Fundamentals vintages and `price_basis`** — still the gate on honest scoring (DATA-1, DATA-2).
6. **Structured scenarios and valuation zones** as dossier fields, so ritual 9 is not a table in chat and anchor drift is a computed flag (§8).
7. **Weekly-hold CTA and an operator complete path** for review tasks.
8. **PR CI** (`typecheck` + test + `db:test` including `review_tasks.sql`) — and either configure eslint or delete the four stub `lint` scripts that pretend to run.
9. **Stop writing no-op signals** (70 of 107 are `X → X`), then triage what remains.

Also cheap and overdue: classify the seven unmapped names; reconcile the SNDK ghost enter; create the quarterly book-review task; send `Idempotency-Key` on agent writes; fix the `[agent:…]` double-prefix; document the `macro` review scope in `gpt-agent-process.md`; resolve mandate rule 1 (cost or market — the code chose market three weeks ago and the doc still says "and/or"); relabel the benchmarks as price return or start ingesting total return.

The process is now real enough that the next review should be able to talk about **calibration** (were the scenarios optimistic?) rather than whether the weekly loop exists. That is the actual Phase-1 test.

---

## 12. Live inventory (measured 2026-09-02)

| Object | Count |
|--------|------:|
| Instruments | 55 |
| Dossiers / versions | 53 / 102 |
| Decisions / outcomes | 38 / 0 |
| Planned actions (open) | 9 (3 open: CRDO pending, SNDK deferred, MRCY add deferred) |
| Review tasks (open) | 27 (16 open) |
| Transactions | 8 (1 deposit + 7 buys; 0 sells) |
| Portfolio snapshots | 15 (through 1 Sep) |
| Signals | 107 (all `new`) |
| Documents | 0 |
| Market bars | 63,582 |
| Fundamentals quarterly | 1,491 |
| App users | 1 operator, 2 viewers |

Auth: hosted signup remains disabled (operator action from 13 Aug). RLS still on. `anon` table grants remain revoked. Leaked-password protection still off (SEC-7 leftover). Several `SECURITY DEFINER` functions remain executable by `PUBLIC` / `authenticated` per the Supabase advisor.

Ledger integrity: `verify_book_against_ledger()` — **15/15 checks OK** against production on 2 Sep (cash $225,499.97 exact; quantity and basis exact for all seven positions). Every read policy is still `for select to authenticated using (true)`, and `requireOperator` appears nowhere in `apps/web/src`, so the two viewer accounts can read the whole book including the deployment queue.

Data freshness: 54 of 55 instruments have bars through the 1 Sep US session; SKHY has a 2 Sep bar (Seoul). 35 of 53 names carry a 2026-06-30-or-later fiscal quarter. `documents` is empty — filings ingest has still not started. 18 of 53 `instrument_setups` are flagged `stale`, 5 `insufficient_data`.

---

## 13. Remediation — 2026-09-02 evening

The three items the operator ranked critical. Everything else in §11 is deferred until the series the kill-switch reads is true.

### 13.1 Snapshot session alignment — **done, applied to production**

`snapshotPortfolio()` no longer stamps wall-clock time or marks from "the newest bar, whatever its date". One session-keyed path now rebuilds the whole series from the ledger and stored bars on every run:

- `as_of` is stamped at the session's own evening, so the generated `snapshot_date` can only be the session being marked.
- The trading calendar is SPY's bars, which carry exchange holidays a weekday rule cannot know. Sessions past `lastCompletedCashSession()` are never marked.
- A position may only be marked with a bar dated that session. A missing bar carries the prior close and is named in `staleMarks` with its real `closeDate`, so provenance is checkable after the fact rather than assumed.
- The separate `backfill.ts` is gone. A late run, a re-run and a backdated fill now converge on the same answer instead of leaving a wrong row nothing overwrites.
- `pnpm --filter @powerfund/worker snapshot:verify` rebuilds and reports without writing.

**A correction to §1.1 found while fixing it.** The first fix bucketed flows on "the first session whose close falls at or after the fill", which rebuilt the series at −25.4%. That was wrong, and the reason matters: `transactions.occurred_at` is when the operator **books** the fill, not an exchange timestamp. The 13 August starters were typed in at 16:20–16:31 ET, and NBIS's 253.76 fill sits inside the 13 August range (247.38–275.96) and outside the 14 August range (256.90–278.66) — the trade was in the 13 August session. `fillSessionDate` is therefore the **New York calendar day of the booking**, walked back to the last weekday. The UTC day is what broke: a fill booked after 20:00 ET is already tomorrow in UTC.

Rebuilt against production, matching the independent reconstruction to four decimal places:

| Metric | Was published | Now | Independent check |
|--------|-------------:|----:|------------------:|
| Deployed TWR since inception | −16.7% | **−15.00%** | −15.00% |
| Deployed drawdown at the 1 Sep close | 18.1% | **16.39%** | 16.39% |
| Max deployed drawdown | 25.1% | **16.39%** | 16.39% |

Row-level effect: 27 Aug is no longer a copy of 26 Aug (+288.22), 28 Aug now contains the VST fill (+2,177.38), 13 Aug drops 29.78 (it had held 12 August closes for four names just bought), and every other session moves by a cent or less. Every row's marks now carry `closeDate` equal to its own session; `alignmentIssues` and `staleSessions` are both empty. The 15 pre-rebuild rows are saved at `/tmp/portfolio_snapshots_backup_2026-09-02.json`.

The breach was real and the 30 August diagnostic was the right call — 16.4% is above the 15% line. Only the magnitude was wrong. On the live mark the sleeve currently reads 14.2%, back below the diagnostic.

**Tests.** `snapshot-alignment.test.ts` — 18 assertions covering session attribution, flow bucketing on the booking session, flows folding into the next mark when a session has no snapshot, marks that may only come from their own session, stale marks declared with provenance, and a regression pinned to the real 26 Aug–1 Sep numbers that reproduces the fabricated −14.1% day and then shows the rebuild without it. Suite: 221 passing.

### 13.2 Currency guard — **done, applied to production**

`bookCurrencyBlock()` refuses any non-USD listing at the buy gate, before caps are evaluated and with no override — a written reason cannot make the arithmetic true. SKHY's row was corrected in production from `exchange: 'US', currency: 'USD'` to `KRX / KRW`, so the guard now recognises what every stored number against it already was.

`supabase/migrations/20260902220000_book_currency_guard.sql` adds the ledger-level backstop — a `before insert` trigger on `transactions` refusing a non-USD buy — and is now applied. The book cannot hold a foreign-currency position even if the app guard were bypassed. Sells stay allowed so an existing position could still be unwound.

The trigger was verified by clean application, not by attempting a live insert: proving a guard by writing a fake ₩1.6m buy into the production ledger is not a test worth running. A malformed `create trigger` would have aborted the migration transaction and left the version unrecorded; the version is recorded.

### 13.3 Operator-only writes — **done**

`requireOperator()` guards every mutating server action: `bookFill`, `sellPosition`, `savePosition`, `savePlannedAction`, `confirmPlannedAction`, defer/cancel/restore, `recordCashEntry`, `saveDecision`, `saveDossier`. RLS remains the actual boundary; this is defence in depth and turns a raw Postgres error into a sentence. The mutation UI is now gated on role: Portfolio's Add fill / Plan buy / Cash entry / Confirm / Defer / Cancel / Sell, the dossier editor, and the decision form all hide for a viewer, and Portfolio's header reads "Read-only access".

**Still open, and it is the more important half:** every read policy is still `for select to authenticated using (true)`. The two viewer accounts can read exact dollars, the journal, and the deployment queue — the not-yet-executed buys. Hiding the buttons does not change that. Deciding the per-table read surface (weights and closed history, not dollars and not the queue) is the remaining SEC-6 work.

### 13.4 Migration drift — **resolved, production treated as authoritative**

`supabase db push` was blocked by a three-way mismatch:

| Version | State |
|---------|-------|
| `20260901034006_copy_enter_invalidation_to_position` | local only — **never applied to production** |
| `20260902040000_instrument_data_symbol` | local only — never applied, though production *has* the `data_symbol` column |
| `20260902041655` | **production only — no local file** |

Production evidently received the `data_symbol` change under a version the repo does not record. On the operator's instruction that the live database is the authoritative state, this was reconciled as:

1. `migration repair --status applied 20260902040000` — its effects are demonstrably present (the `data_symbol` column exists, SKHY is mapped to `000660.KS`, and bars are ingested under that listing). It was **deliberately not replayed**: the file contains `delete from market_bars` / `market_caps` for SKHY, and replaying it would have wiped 1,340 live bars for no gain.
2. `migration repair --status reverted 20260902041655` — drops the phantom history row. Repair edits only `supabase_migrations.schema_migrations`; the schema effects it recorded stay in the database.
3. `db push --include-all` — applied `20260901034006` and `20260902220000`. The copy-invalidation migration was **allowed to run rather than marked applied**: it is idempotent (`create or replace function`, `drop trigger if exists`, and a backfill guarded on blank invalidation), so running it removes the uncertainty about whether the trigger existed in production instead of recording a guess. `--include-all` was required because it predates the last remote version.

Verified after: 23 versions, **0 mismatched**; ledger reconciliation 17/17; SKHY's 1,340 bars intact; all 8 open positions still carry kill criteria. Repo and production are in sync for the first time since 1 September.

---

## 14. DATA-1 closed, and the first honest read on the scorer — 2026-09-03

### 14.1 Fundamentals are vintaged

`fundamentals_vintages` is append-only: one observation per quarter per filing,
with `filed_at`, a never-null `knowable_at` and a `knowable_basis` of `filing`
or `estimated`. `fundamentals_quarterly` remains the trigger-maintained
latest-known projection, so no read path changed.
`fundamentals_as_of(instrument, date)` returns the newest observation of each
period already filed by then.

**The table was not the hard part.** Backfilling filing dates from the stored
payloads gave a median lag of **397 days**. companyfacts reports a period again
in every later filing that carries it as a comparative, and the client kept only
the most recently filed unit — so NVIDIA's July 2025 quarter came back stamped
26 Aug 2026, the FY27 Q2 10-Q, rather than the 27 Aug 2025 filing that first
disclosed it. That would have told a backtest we knew nothing for a year: a
different flavour of the same disease.

The client now emits one vintage per filing, resolving each measure to the
newest fact filed by that date and dropping filings that merely repeat the
previous numbers.

| Period year | Median filing lag before | After |
|---|---:|---:|
| 2015 | ~398d | 35d |
| 2020 | ~400d | 34d |
| 2025 | ~388d | 33d |

Production holds **3,247 vintages**, 92% with a real filing date, and **144
quarters were genuinely revised after first disclosure**. The projection grew
from 1,491 to 2,019 quarters, because per-filing ingest recovers periods the
collapse-to-one-row path never stored. Yahoo rows carry `period_end + 90 days`
flagged `estimated` — late on purpose — and a strict run can drop them.

### 14.2 The scorer can be asked what it knew

`sliceScorerInputsAsOf` assembles a scorer's inputs as they stood on a date. The
live run and a replay use that one function, so today is just the last slice.
Hysteresis carries forward through a replay rather than being seeded from stored
state. `score:replay` grades each setup on forward returns.

### 14.3 First replay — 53 names, 63 monthly dates, 2021-06 → 2026-08

2,619 observations. Raw returns are enormous because this universe over this
window was an AI bull market, so only the excess column means anything.

| Setup | n | 12m mean | 12m vs universe |
|---|---:|---:|---:|
| Insufficient data | 477 | 128.3% | **+58.4%** |
| Improving — extended | 488 | 89.0% | **+17.0%** |
| Correction candidate | 231 | 96.9% | +10.5% |
| Avoid / late-cycle | 409 | 57.9% | −18.9% |
| **Improving — research now** | **203** | **16.0%** | **−4.2%** |
| Watch | 438 | 33.2% | −36.3% |
| Falling fundamentals | 265 | 57.3% | −35.5% |

**The flagship state is the worst of the informative ones.** `improving_research`
— the "buy this now" setup — underperforms the universe at 3m (−0.7%), 6m
(−4.0%) and 12m (−4.2%), on a 203-observation sample. The two states that beat
the universe are `insufficient_data`, which is not a signal but a selection
artifact (names with no fundamentals are the recent hypergrowth listings that
happened to moon), and `improving_extended`, which by its own definition means
the price has already run — momentum, not earliness.

**Read this against a hard caveat.** The 53 names are *today's* watchlist,
assembled partly because they already worked. Replaying it over 2021–2026 is
exactly the survivorship contamination `goals.md` warns about, and the universe
baseline is drawn from the same survivor set, so even the excess column is
flattered. What the replay can support is the *relative* statement: within the
same contaminated universe, the setup meant to say "buy" ranks below the setup
meant to say "too late".

**Conclusion: do not wire `fundamental_inflection_v1` into Briefing or the buy
gate.** It has not earned it. Keeping it shadow was the right call. The
constructive next step is not to tune thresholds against this sample — that is
how you fit noise — but to build the universe survivorship fix (a point-in-time
watchlist, names as they were added, including ones since dropped) so the
question can be asked properly.
