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

## Risk rules (non-negotiable)

Exact percentages can be tuned; the existence of hard caps cannot.

1. **Max single-position weight** — cap % of portfolio NAV at cost and/or at market (define one primary rule and stick to it).
2. **Max theme concentration** — cap combined weight in any one theme (AI infra, Energy, Robotics, Defence, Other).
3. **Cash buffer** — maintain a minimum cash (or cash-like) percentage for opportunity and stress.
4. **Thesis invalidation** — every position has written kill criteria **recorded before or at fill time**; a fill without invalidation on the book is a mandate violation, not a TODO. Hit → exit or reduce, do not renegotiate emotionally.
5. **No average-down without new evidence** — adding requires incremental information, not price alone.
6. **Parabolic / crowded filter** — prefer not initiating full size into vertical, highly crowded moves without a fresh asymmetric catalyst. Crowding is **measured, not felt**: check valuation percentile vs the name's own 5-year history, short interest, extension above the 200-day average, and consensus-revision breadth before entry. "Skip if it feels like chasing" notes are binding — if the note exists and the tape gaps up, the answer is skip.
7. **Liquidity** — position size must respect average volume and expected exit horizon.
8. **Kill-switch** — defined on **deployed capital**, not total NAV (a 90%-cash book can never trigger an NAV-level switch, and a fully deployed book in high-vol names makes a tight NAV switch a near-certain forced sale). If deployed-capital drawdown from peak exceeds the threshold, reduce risk (trim, halt new risk, or raise cash) until review is complete.
9. **AI memory cycle discipline** — HBM/DRAM/NAND names count toward the **AI infrastructure** theme (not a separate core theme). Do not treat peak-cycle EPS or trough trailing multiples as “cheap” without contract coverage, mix shift, and normalized-earnings evidence. Prefer starter sizes; add only on new information. Soft guide: pure memory/storage names ≤ **15% NAV** until the sleeve earns a larger allocation in review.
10. **Factor concentration (correlation-aware)** — theme labels are not diversification. AI infra, data-center power/cooling, AI-linked energy, GPU clouds, and much of robotics/defence electronics all load on the same factor: **hyperscaler capex sentiment**. Track pairwise correlation of holdings and candidates; cap combined exposure to the AI-capex complex as one position-like risk, and maintain a standing "hyperscaler capex guidance −20%" stress scenario before adding correlated risk. Genuine diversifiers within mandate: uranium fuel cycle, regulated-utility-adjacent power, appropriations-driven defence primes, backlog-based construction — not a third cooling vendor.

*Initial numeric defaults (revise after first live month):*

| Rule | Default |
|------|---------|
| Max position | 10% NAV |
| Max theme | 40% NAV |
| Min cash | 10% NAV |
| Drawdown kill-switch | 15% of **deployed capital** from peak → mandatory review + risk reduction |
| Soft max AI memory/storage sleeve | 15% NAV (inside AI infra) |
| Soft max AI-capex factor exposure | 70% of deployed capital until Phase 3 risk view exists |
| Phase-1 invested cap | $75,000 cost |

## Capital & deployment

PowerFund **NAV** is the equity book only: **cash + marked stocks**. Starting allocated capital: **$250,000**. Bitcoin and gold are a separate sleeve and must not be counted as PowerFund cash.

| Rule | Default |
|------|---------|
| Allocated NAV | $250,000 |
| Phase-1 invested cap (cost) | $75,000 |
| Min cash | 10% of NAV |
| BTC / gold | Out of scope |

**NAV** = cash + market value of open positions. Adding a fill **debits cash** by cost basis.

New risk is planned in the **deployment queue** (dollars + window + why) and only hits the book when a fill is confirmed. Do not treat a weekly dollar target as a quota.

**Deployment ladder (pre-committed, not mood-based):** "keeping ammunition for volatility" without pre-commitment is market timing, and the −25% day will not get bought on discretion. Deploy via:

1. A **baseline tranche** per month up to the phase invested cap (size set at monthly review).
2. **Acceleration tranches** triggered by theme drawdowns (e.g. −10% and −20% from entry), gated by a thesis-intact checklist — not by price alone.
3. Cash level is a **decision recorded at review**, not drift. If cash exceeds plan for two consecutive reviews, either deploy per ladder or write down why not.

**Phase 1 (first weeks):** stay well under the invested cap. Starter stubs first; add on thesis-intact weakness or confirmation. Do not treat a weekly dollar target as a quota.

**Out of scope for this book:** BTC DCA, gold as BTC reserve, and any capital not explicitly moved into PowerFund cash.

## Decision process

Every material idea is logged before or at action time:

1. **Thesis** — what must be true
2. **Catalysts** — what could reprice the asset
3. **Risks** — what breaks the thesis
4. **Invalidation** — observable conditions that force exit/reduce
5. **Sizing** — why this weight given volatility, liquidity, conviction
6. **Outcome review** — after exit or major change: process grade, not just P&L

## Edge definition

We seek situations where **fundamentals, CapEx, contracts, policy, or supply-chain evidence** are improving (or about to) while **price and narrative have not fully discounted** that path.

We do not define edge as:

- trading every headline in a hot sector
- buying solely because a story is fashionable
- assuming “AI” or “defence” in the name is sufficient

**Label trades honestly.** A datapoint that appears in an IEA flagship report, a NATO communiqué, or hyperscaler guidance is consensus by definition — citing it is not evidence of earliness. When a position does not clear the earliness bar, call it what it is: **momentum with fundamental support**. That label is allowed, but it changes the exit posture from buy-and-hold to trend-following with theme-level exit indicators (see [themes.md](./themes.md)) and makes the crowded filter (rule 6) mandatory, not advisory.

**Stretch targets never override risk rules.** Return scenarios (e.g. doubling over N years) are scenarios, not objectives. If a target implies volatility that makes the kill-switch a near-certain trigger, revise the target — not the kill-switch. (See [2026-08-13 strategy second opinion](./reviews/2026-08-13-strategy-second-opinion.md), finding 3.)

## Instruments & leverage

- Spot/long equity and liquid commodity proxies first.
- Options, leverage, and shorting: allowed only with explicit rules added to this mandate (size, max loss, purpose).
- Until then: no leverage beyond broker default cash/margin for settlement convenience; no speculative options book.

## Review cadence

| Cadence | Activity |
|---------|----------|
| Weekly | Book review, open theses, risk flags, signal quality |
| Monthly | Mandate compliance, theme mix, lesson write-ups |
| Quarterly | Strategy fit vs opportunity set; update defaults if needed |

## Compliance note (future scale)

Personal capital today. Any third-party capital, advice, or published signals for others requires separate legal/compliance work. This mandate does not authorize that activity.