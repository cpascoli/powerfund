# Investment Mandate

Living document. Update when rules change; do not silently violate.

## Purpose

Manage capital for absolute return with a bias toward high-growth thematic opportunities in AI infrastructure, energy, robotics/AI, and defence — while prioritizing capital preservation and avoiding late entry after parabolic, crowded moves.

## Scope

| In scope | Out of scope (initially) |
|----------|---------------------------|
| Listed equities | Illiquid private deals as core book |
| Commodity exposure via liquid proxies (ETFs, later futures) | HFT / market making |
| Related themes that clear the same evidence bar | Mandating full automation of live trades |
| Cash as a strategic position | Concentration that ignores risk rules |

Universe preference: liquid names where exits are realistic. Illiquid microcaps only with explicit size caps and a written exception.

## Return & risk posture

- **Objective**: grow capital meaningfully by capturing structural themes early and correctly sized.
- **Constraint**: drawdowns and thesis failure must be survivable; no “double down to get back to even” without new evidence.
- **Style**: long-biased thematic; hedges and shorts optional later, not required for MVP.

## Benchmarks

Success is measured against public total-return indices, not against a homemade blend and not against the two-year doubling scenario.

| Role | Benchmark | Question it answers |
|------|-----------|---------------------|
| **Success (primary)** | S&P 500 total return | Did the book beat owning the market? |
| **Style (secondary)** | Nasdaq-100 (QQQ) total return | Did the thematic sleeve earn its growth beta? |

Judge both **NAV** (cash included — this grades the cash decision) and the **deployed sleeve** (stock picking only). Prefer rolling three-year windows once the history exists; until then, report since inception and since each review.

Do not introduce a blended S&P/QQQ policy portfolio. Do not change the primary benchmark to make a period look better.

## Risk rules (non-negotiable)

Exact percentages can be tuned; the existence of hard caps cannot.

1. **Max single-position weight** — cap % of portfolio NAV at cost and/or at market (define one primary rule and stick to it).
2. **Max theme concentration** — cap combined weight in any one theme (AI infra, Energy, Robotics, Defence, Other).
3. **Cash buffer** — maintain a minimum cash (or cash-like) percentage for opportunity and stress.
4. **Thesis invalidation** — every position has written kill criteria **recorded before or at fill time**; a fill without invalidation on the book is a mandate violation, not a TODO. Hit → exit or reduce, do not renegotiate emotionally.
5. **No average-down without new evidence** — adding requires incremental information, not price alone.
6. **Parabolic / crowded filter** — prefer not initiating full size into vertical, highly crowded moves without a fresh asymmetric catalyst. Crowding is **measured, not felt**: check valuation percentile vs the name's own 5-year history, short interest, extension above the 200-day average, and consensus-revision breadth before entry. "Skip if it feels like chasing" notes are binding — if the note exists and the tape gaps up, the answer is skip.
7. **Liquidity** — position size must respect average volume and expected exit horizon.
8. **Kill-switch** — measure **both** (a) drawdown on the **unitized** deployed sleeve (time-weighted, so a new fill at cost is not a loss) and (b) NAV drawdown (cash included). The sleeve answers “are we selecting or timing badly?” NAV answers “is fund capital actually impaired?” A 90%-cash book can never trip an NAV switch, which is why the **diagnostic** stays on deployed capital. Do not treat a 15% loss on an $18k seed book as the same event as a 15% loss on $200k deployed.

   **−15% unitized deployed sleeve = mandatory diagnostic review**, not an automatic trim. Classify the move before acting:

   | Class | Meaning | Typical capital Phase-1 response |
   |-------|---------|--------------------------|
   | Valuation shock | Prices down; estimates, backlog, and catalysts intact | Hold; may **accelerate** per the deployment ladder |
   | Factor shock | One common exposure (e.g. AI-capex) is repriced | Pause more capital into that factor; keep deploying independent themes |
   | Earnings / fundamental shock | Intrinsic values are falling | Slow or halt new risk in the affected names |
   | Thesis failure | The investment premise is wrong | Reduce/exit **that name** regardless of portfolio drawdown |

   Per-name invalidation (rule 4) still forces exit or reduce immediately. Do not wait for a book-level trigger.

   **Capital Phase 1 (invested cost at or below $75k):** cash is already the risk-management lever. A 15% sleeve drawdown does **not** halt thesis-intact buys and does **not** require raising cash. The buy gate matches this: it will not refuse a fill solely on the 15% flag while still under the capital Phase-1 cap.

   The 15% **condition** stays on Portfolio → Mandate while the sleeve is still below its high-water mark. Briefing Due only asks for the diagnostic until a covering book-level write exists for this breach (a completed portfolio review task that names the sleeve diagnostic). It re-opens if the sleeve recovers then breaches again, if drawdown deepens by **5 percentage points** from the diagnosed print, or after **14 days** while still breached.

   **After capital Phase 1:** the same 15% remains a diagnostic. Until a harder NAV-aware capital-preservation threshold is set (revise after the first live month), new buys still need a written override while the flag is on. That is a temporary software halt, not an order to sell the book.
9. **AI memory cycle discipline** — HBM/DRAM/NAND names are the **`ai_memory` sleeve** inside AI infrastructure (not a separate core theme). They count **fully** toward the rule-10 AI-capex cap. Do not treat peak-cycle EPS or trough trailing multiples as “cheap” without contract coverage, mix shift, and normalized-earnings evidence. Prefer starter sizes; add only on new information. Soft guide: memory/storage sleeve ≤ **15% NAV** until it earns a larger allocation in review.
10. **Factor concentration (correlation-aware)** — theme labels are not diversification. The mandate map is a **unit-sum allocation**, not a stress-beta model: each name has explicit weights, a one-line rationale, and a review date. Unknown names are unclassified and flagged. Cap weighted **AI-capex + AI-memory** as one position-like risk **vs NAV (cash included)**. DoD autonomy, commercial aerospace, and surgical-procedure growth are not hyperscaler capex. Maintain a standing "hyperscaler capex guidance −20%" stress (haircut × mapped AI-capex/memory weight). Cash is a diversifier versus this factor; the kill-switch (rule 8) stays on deployed capital.

*Initial numeric defaults (revise after first live month):*

| Rule | Default |
|------|---------|
| Max position | 10% NAV |
| Max theme | 40% NAV |
| Min cash | 10% NAV |
| Drawdown diagnostic | 15% of **deployed capital** from peak → mandatory review. Capital Phase 1: no automatic trim and no buy halt. After capital Phase 1: new buys need an override until a harder capital threshold is chosen |
| Soft max AI memory/storage sleeve | 15% NAV (inside AI infra) |
| Soft max AI-capex factor exposure | 40% NAV (cash included; same number as the theme cap) |
| Capital Phase-1 invested cap | $75,000 cost (**only live invested-cost cap**) |
| Capital Phase-2 / Phase-3 caps | Not authorized. Default **proposals** ($150k / ~$225k) are confirmed or revised at the prior phase review |
| Baseline deployment tranche | ~$10,000/month (set 2026-08-13; revisit at monthly review) |

## Capital & deployment

PowerFund **NAV** is the equity book only: **cash + marked stocks**. Starting allocated capital: **$250,000**. Bitcoin and gold are a separate sleeve and must not be counted as PowerFund cash.

| Rule | Default |
|------|---------|
| Allocated NAV | $250,000 |
| Capital Phase-1 invested cap (cost) | $75,000 |
| Min cash | 10% of NAV |
| Theoretical max invested (10% cash) | ~$225,000 — not a target and not authorized |
| BTC / gold | Out of scope |

**NAV** = cash + market value of open positions. Adding a fill **debits cash** by cost basis.

New risk is planned in the **deployment queue** (dollars + window + why) and only hits the book when a fill is confirmed. Do not treat a weekly dollar target as a quota.

**Principle:** PowerFund does not allocate capital because capital is available. Capital is released in stages as the investment process earns greater trust.

These **capital** phases are not the software phases in [plan.md](./plan.md). Software work supports the PM; it does not authorize more invested cost. Do not wait for software Phase N to enter capital Phase N. The operator process that implements this ladder is [gpt-agent-process.md](./gpt-agent-process.md).

### Capital deployment phases

| Stage | Invested cost | Primary question | Status |
|-------|---------------|------------------|--------|
| **1 — Seed** | $0–$75,000 (**live cap**) | Does the process work? | Current. Immediate job is evidence, not racing to the cap. |
| **2 — Scale** | Next cap set at the Phase-1 review. Default **proposal**: $75,000–$150,000 | Does the process repeat and scale? | Not authorized. $150k is a proposal, not a buy-gate number. |
| **3 — Full proprietary** | Next cap set at the Phase-2 review. Default **proposal**: up to ~$225,000 (allocated NAV minus min cash) | Can we trust the system with essentially the whole book? | Not authorized. |
| **4 — External** | Someone else’s money | Is the edge institutionalizable? | Separate legal/compliance gate. This mandate does not authorize it. |

Only the $75k Phase-1 cap is live in the buy gate. Continuing past an **authorized** cap without the written review is a mandate violation, not a rounding error.

#### Capital Phase 1 — Prove the process with limited live capital

Deploy up to $75k invested cost of the $250k allocated NAV. Baseline ~$10k/month, starter positions first, acceleration only when weakness is thesis-intact.

The objective is **not** primarily to maximize returns on $75k. It is to answer: does the PowerFund investment process actually work when real money is involved?

**Gate:** can we `research → decide → size → deploy → monitor → invalidate → review`, repeatedly, without breaking our own rules?

Evidence we want before crossing $75k:

1. **Selection** — we can distinguish genuine opportunities from fashionable thematic exposure.
2. **Sizing** — starters, adds, factor caps, and cash prevent a bad idea from becoming a portfolio-level problem.
3. **Anti-chase** — we do not deploy simply because an asset or theme is moving.
4. **Volatility** — a correction leads to reassessment and selective acceleration, not panic or indiscriminate averaging down.
5. **Journal** — we can tell good process / bad outcome from bad process / good outcome.
6. **Operations** — the weekly PM workflow runs through PowerFund, not partly in the operator’s head.

Before any buy that would take invested cost through $75k, write the Phase-1 → Phase-2 review ([gpt-agent-process.md](./gpt-agent-process.md) ritual 13):

1. All four core themes represented, or a hole explicit and accepted.
2. Factor mix (especially AI-capex) acceptable vs the −20% stress — ticker-count is not diversification.
3. Starters have had at least one evidence cycle (print, backlog, or guidance — not just price).
4. The deployment ladder behaved, or skips were written down.
5. Scenario / valuation calibration is credible, not systematically too optimistic.
6. **What the next invested cap and cash target are.** Default proposal to confirm or revise: Phase-2 cap **$150k** invested cost.

Starter stubs first. Add on thesis-intact weakness or confirmation. Do not treat a weekly dollar target as a quota.

#### Capital Phase 2 — Increase capital only after the process earns it

There is **no** live Phase-2 dollar cap. Phase 1 proves we can operate the machine. Phase 2 should prove the machine **scales** — that the process still works when positions and portfolio interactions are economically meaningful.

Evidence before committing substantially more of the $250k (and before authorizing a Phase-3 cap):

1. **Repeatability** — decisions are not one or two lucky trades.
2. **Portfolio-level risk** — correlation, AI-capex factor, theme concentration, and stress scenarios actually change incremental capital decisions.
3. **Allocation** — the system chooses not only what to own, but where the next dollar goes.
4. **Evidence-driven adds** — larger positions are earned by thesis confirmation or a genuine valuation dislocation, not price anchoring.
5. **Drawdown behavior** — enough volatility to see whether the process behaves under stress.
6. **Calibration** — expected-return scenarios, bear cases, valuation zones, and invalidation thresholds have some relationship to reality.
7. **Signal usefulness** — at least some research / data machinery produces information that improves decisions, not just more research. Desired evidence; **not** a lock that software Phase 2 must be “done.”

At the Phase-2 → Phase-3 review, set the next invested cap and cash target. Default proposal to confirm or revise: up to ~$225k invested cost (10% min cash on $250k NAV).

#### Capital Phase 3 — Earn the right to deploy most of the allocated capital

Would we trust this process with the entire proprietary allocation through ordinary stress — not “did we beat the S&P this quarter”?

A full multi-year market cycle is the **capital Phase 4** bar, not a reason to freeze the last proprietary dollars for years if the Phase-2 proofs are real. Before authorizing something approaching full proprietary deployment, require:

1. **Multiple decision types** — entries, adds, holds, reductions, and exits — not only buys.
2. **Actual thesis failures** — we exited or reduced when evidence broke, rather than rewriting the thesis.
3. **At least one meaningful factor stress** — we saw what happens when a major common factor fell sharply.
4. **Risk-before-capital** — new risk is evaluated against the whole book before it is committed.
5. **Theme rotation process** — capital can move across AI infrastructure, power, robotics, and defence on expected return, not narrative loyalty.
6. **Benchmark reporting** — NAV and the deployed sleeve are judged vs S&P 500 and QQQ as this mandate requires (reporting discipline, not a hurdle that must already be cleared).
7. **Process alpha** — decisions where the system caused us **not** to chase, **not** to average down, to exit a broken thesis, or to buy more in a legitimate dislocation. Errors avoided count.

Min cash still applies. ~$225k invested is the theoretical ceiling under the current 10% cash rule, not a quota.

#### Capital Phase 4 — Outside capital is a different gate

Only after the proprietary $250k book produces evidence should we consider someone else’s money. Proof is qualitative, not “a few months of winners”:

1. **Track record** — not a backtest.
2. **Repeatable attribution** — we can explain where performance came from.
3. **Process evidence** — contemporaneous theses are preserved; no hindsight reconstruction.
4. **Risk evidence** — drawdowns, concentration, and losing names were handled per this mandate.
5. **Operational reliability** — research, data, book, and reviews survive institutional scrutiny.
6. **Compliance readiness** — legal structure, reporting, custody, investor communications, and regulation are solved **before** money is solicited.

This mandate does not authorize that activity. Software Phase 4 in [plan.md](./plan.md) is the product workstream; both gates are required.

### Deployment ladder

Pre-committed, not mood-based. "Keeping ammunition for volatility" without pre-commitment is market timing, and the −25% day will not get bought on discretion. Cash is a call option on future dislocations — but maximizing cash because a crash is expected will hurt CAGR if markets keep compounding. The book should rarely reach a 20–30% scare with nothing left to deploy. That can mean cash, or fully valued positions that can be recycled.

Deploy via:

1. A **baseline tranche** per month up to the **authorized** phase invested cap. Current: **~$10k/month** (set 2026-08-13), which reaches the $75k capital Phase-1 cap around January 2027. Continuing past an authorized cap is the phase-transition review, not creep.
2. **Acceleration tranches** triggered by theme drawdowns (e.g. −10% and −20% from entry), gated by a thesis-intact checklist — not by price alone. A book-level 15% sleeve drawdown that classifies as a **valuation shock** (rule 8) is the same kind of event: diagnose, then deploy per this ladder if the checklist passes. Do not freeze the ladder because starters did what volatile growth starters do.
3. Cash level is a **decision recorded at review**, not drift. If cash exceeds plan for two consecutive reviews, either deploy per ladder or write down why not.

**Out of scope for this book:** BTC DCA, gold as BTC reserve, and any capital not explicitly moved into PowerFund cash.

## Decision process

Every material idea is logged before or at action time:

1. **Thesis** — what must be true
2. **Catalysts** — what could reprice the asset
3. **Risks** — what breaks the thesis
4. **Invalidation** — observable conditions that force exit/reduce
5. **Sizing** — why this weight given volatility, liquidity, conviction
6. **Outcome review** — after exit or major change: process grade, not just P&L

Every high-quality dossier should answer not only “would we own this?” but **at what price we become unusually eager**. States are driven by scenario values vs price, not by a raw percentage drawdown:

| State | Interpretation | Capital posture |
|-------|----------------|-----------------|
| Fair / full | Good company, ordinary prospective return | Wait / starter only |
| Attractive | Base-case expected return compelling | Normal deployment |
| Dislocation | Price fell materially more than intrinsic value | Accelerate (ladder + thesis-intact checklist) |
| Panic | Forced or factor selling, thesis intact, exceptional asymmetry | Deploy aggressively within mandate limits |
| Thesis impairment | Price decline reflects lower intrinsic value | Not an opportunity |

A name falling from $200 to $150 is not automatically more attractive if base value fell from $220 to $140. A name whose base value rose while the stock fell has become the situation cash is for. Rank these states on the monthly opportunity pass ([gpt-agent-process.md](./gpt-agent-process.md) ritual 9).

## Edge definition

We seek situations where **fundamentals, CapEx, contracts, policy, or supply-chain evidence** are improving (or about to) while **price and narrative have not fully discounted** that path.

That edge has two complementary expressions:

1. **Volatility alpha** — own and research high-quality structural winners; concentrate deployment when fear creates a valuation dislocation while the thesis, and our estimate of intrinsic value, is intact. We do not buy because something fell 25%. We buy more aggressively when something we already understand fell and intrinsic value did not.
2. **Bottleneck discovery** — continuously search further down the supply chain for less-followed companies whose earnings power is being transformed before valuations fully reflect it. Prefer control of a bottleneck, switching costs, and inflecting orders over “it is small.” The ideal discovery is an obscure mid-cap in a rapidly scaling system whose qualification creates switching costs, orders inflect, estimates rise repeatedly, and the multiple rerates.

We do not define edge as:

- trading every headline in a hot sector
- buying solely because a story is fashionable
- assuming “AI” or “defence” in the name is sufficient
- a permanent exclusion list of popular names

**Crowding is a penalty to required margin of safety, not an absolute ban.** A heavily owned consensus winner (NVIDIA, a hyperscaler, a future OpenAI listing) can still be owned after a large dislocation. An underfollowed name can earn capital earlier because expectations are lower. Crowding still creates higher overlap, violent unwind risk, and less asymmetry — measure it (rule 6); do not pretend it is a virtue.

**Label trades honestly.** A datapoint that appears in an IEA flagship report, a NATO communiqué, or hyperscaler guidance is consensus by definition — citing it is not evidence of earliness. When a position does not clear the earliness bar, call it what it is: **momentum with fundamental support**. That label is allowed, but it changes the exit posture from buy-and-hold to trend-following with theme-level exit indicators (see [themes.md](./themes.md)) and makes the crowded filter (rule 6) mandatory, not advisory.

**Stretch targets never override risk rules.** Return scenarios (e.g. doubling over N years) are scenarios, not objectives. Recurring 20–40% thematic corrections are part of the return engine if we have already done the research; they are not a reason to disable the 15% deployed diagnostic. Keep measuring it even if a growth book is likely to touch it. What capital Phase 1 changes is the **response** (diagnose, maybe deploy) — not the measurement, and not per-name invalidation. (See [2026-08-13 strategy second opinion](./reviews/2026-08-13-strategy-second-opinion.md), finding 3.)

## Instruments & leverage

- Spot/long equity and liquid commodity proxies first.
- Options, leverage, and shorting: allowed only with explicit rules added to this mandate (size, max loss, purpose).
- Until then: no leverage beyond broker default cash/margin for settlement convenience; no speculative options book.

## Review cadence

| Cadence | Activity | Where it is stored |
|---------|----------|-------------------|
| Weekly | Book review, open theses, risk flags, signal quality | Per-name **journal** (`hold` / `add` / `reduce` / `exit`). Not a review task. |
| Monthly | Mandate compliance, theme mix, where the next dollar goes, lesson write-ups | One **portfolio** review task (`Monthly book pass — YYYY-MM`). Process: [gpt-agent-process.md](./gpt-agent-process.md) rituals 6 and 9. |
| Quarterly | Strategy fit; theme and factor weights; NAV and deployed performance vs S&P 500 and QQQ; decision calibration; update defaults if needed | One **portfolio** review task (`Quarterly book review — YYYY-Qn`). Process: rituals 10 and 12. |

## Compliance note (future scale)

Personal capital today. Any third-party capital, advice, or published signals for others is **capital Phase 4**: separate legal/compliance work, and only after the proprietary book has produced the Phase-4 proofs above. This mandate does not authorize that activity.