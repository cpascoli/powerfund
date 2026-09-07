# Software plan

How we build the Research OS. **Not** the capital-deployment plan.

Phases here are product gates. Capital is released on a separate ladder in [mandate.md](./mandate.md) (capital Phases 1–4). Same numbers, different object. Do not wait for software Phase N to enter capital Phase N — capital is already live; some risk tooling was pulled forward for that reason.

| Phase | One line | Objective | What “done” means |
|-------|----------|-----------|-------------------|
| **0 — Operating model** | Codify the PM | Get the thinking out of the operator’s head. Define goals, mandate, risk rules, theme map, and architecture principles before building software around them. | Philosophy is explicit enough that schema, tooling, and pipelines can be built without re-deciding the investment process every week. **Complete.** |
| **1 — Research OS** | Augment the PM | Make one operator a better portfolio manager: memory, discipline, workflow, and accountability (dossiers, watchlists, book, queue, signals, journal, reviews). | The weekly investment process can run entirely through PowerFund, even if some research and signals stay manual. **Current primary phase.** |
| **2 — Data & quantitative pipelines** | Expand the PM’s perception | Ingest breadth and systematically identify earliness and quality. Machines scan more filings, fundamentals, capex, contracts, and thematic evidence than one human could. | At least one **non-price, explainable automated scorer** is genuinely used in production, and the `signal → human review → decision journal` loop is routine. Parts have started early (EOD bars, quarterly fundamentals). |
| **3 — Risk & portfolio construction** | Constrain the PM | Encode fund-like discipline: factors, correlations, concentration, stress, sizing, kill-switch workflows. Make correlated risk and adverse scenarios hard to ignore. | Risk is checked before every increment of capital; policy violations are visible and blocking. A minimum slice (correlation, crowding, AI-capex stress) is already live because real capital is deployed. |
| **4 — Insight product / other capital** | Scale the edge | Externalize only after the personal process has evidence. Possible path: research product → advisory/SMA → formal vehicle. | Deliberate go/no-go on track record, process evidence, regulatory burden, and economics. **Not started and explicitly optional.** Capital Phase 4 in the mandate is the money-and-compliance gate; this phase is the product work. Both are required before anyone else’s capital. |

Success criteria and non-goals: [goals.md](./goals.md). PM rituals that implement the **capital** plan: [gpt-agent-process.md](./gpt-agent-process.md).

## Phase 0 — Operating model

**Goal:** Define how we invest before we overbuild software.

Deliverables:

- [x] Project goals ([goals.md](./goals.md))
- [x] Mandate and risk rules ([mandate.md](./mandate.md))
- [x] Theme map ([themes.md](./themes.md))
- [x] This plan
- [x] Architecture folder for living design docs ([../architecture/README.md](../architecture/README.md))

Exit criteria: mandate and themes are clear enough to drive schema, UI, and first pipelines without re-litigating philosophy every week. **Met.**

## Phase 1 — Research OS *(current)*

**Goal:** Make the operator a better portfolio manager.

Build:

- [x] TypeScript monorepo scaffold
- [x] Postgres schema (`themes`, `instruments`, `documents`, `signals`, `positions`, `decisions`, `portfolio_snapshots`)
- [x] Research UI shell + IA (Briefing, Explore, Signals, Workbench, Portfolio, Journal)
- [x] Netlify deploy config for the frontend
- [x] Worker ingest (daily bars + quarterly fundamentals via free APIs)
- [x] GitHub Actions EOD bar ingest (OpenNext does not invoke Netlify scheduled functions)
- [x] Auth + Supabase client wiring (local)
- [x] Watchlists organized by theme (live data + starter universe seed)
- [x] Company dossiers (stub fields + CLS/VRT/NBIS research notes)
- [x] Dossier create/edit UI + market snapshot fields
- [ ] Filings/earnings links on dossiers
- [ ] Signal inbox CRUD (manual + later automated)
- [x] Portfolio book (open positions, cash, NAV, mandate weights)
- [x] Deployment queue (plan buy → confirm fill)
- [x] Decision journal CRUD (thesis → action → review)
- [x] Review queue — dated obligations with triggers, plus history query
      (`getReviewQueue` filters by status/scope/symbol/theme/date) so a review
      can read what the book concluded last time before writing a new one
- [x] Agent API (`/api/v1/agent`, 19 operations) — the weekly process runs
      through it, not by hand ([agent-api.md](./agent-api.md),
      [gpt-agent-process.md](./gpt-agent-process.md))
- [x] Operator/viewer split — `requireOperator()` plus RLS; viewers read
      research and never the book
- [x] CI on every push (typecheck, tests, web build, migrations against an
      empty database)

Technical direction:

- TypeScript monorepo (pnpm)
- Postgres via Supabase
- Next.js research UI
- Free-tier ingest: Tiingo/Yahoo/Stooq bars + SEC/Yahoo fundamentals ([ADR 0005](../architecture/decisions/0005-free-market-data-vendors.md))

Exit criteria: weekly investment process runs entirely through Power Fund tooling (even if many signals are still manual).

## Phase 2 — Data & quantitative pipelines

**Goal:** Ingest breadth; score for earliness and quality.

Pipelines:

1. **Market** — prices, volume, relative strength, drawdowns; options later if useful
2. **Fundamentals & filings** — 10-K/Q, 8-K, transcripts, CapEx, guidance, insider activity
3. **Thematic / alternative** — CapEx & power for AI; grid/energy; robotics adoption; defence contracts/budgets

Platform shape:

`ingest → normalize → entity resolve → feature store → scorers → alerts → human review`

Start with rules and simple factors, not deep learning.

Exit criteria: at least one explainable automated scorer in production use that is not pure price technicals; signal → decision journal loop is routine.

Ingestion is the *input* to this phase, not a slice of “done.” EOD bars and quarterly fundamentals are already running; that does not meet the exit criterion.

**Built (2026-09-03), and it changed what “done” costs.** The middle of the
platform shape now exists: `fundamentals_vintages` makes fundamentals
point-in-time (append-only, one observation per filing, `knowable_at` from the
filing that disclosed it); `sliceScorerInputsAsOf` lets the scorer be asked what
it knew on any past date, so the live run and a replay share one function; and
`score:replay` grades each setup on forward returns with a leave-one-out
universe baseline.

The first thing that machinery produced was a **negative result**, and it is the
most valuable output of this phase so far. Over 53 names and 63 monthly dates,
`fundamental_inflection_v1`’s “buy now” state *underperforms* the universe by
6.4% at twelve months, while “already extended” and “already fallen” beat it.
So the exit criterion is further away than a feature list would suggest — we can
now measure whether a scorer works, and the first one does not. See the
[full review](./reviews/2026-09-02-full-review.md) §14. Do not tune it against
that sample: the universe is survivorship-contaminated.

## Phase 3 — Risk & portfolio construction

**Goal:** Fund-like discipline in software.

**Minimum slice pulled forward (2026-08-13):** capital is live while this phase is unfinished. Before deployed cost crossed ~$40–50k we stood up (a) a pairwise correlation matrix of holdings and candidates, (b) an AI-capex factor exposure view (mandate rule 10), and (c) a standing “hyperscaler capex guidance −20%” stress. Workbench → Risk, 2026-08-14.

Still to encode:

- Exposure by theme, factor, geography, commodity beta
- Concentration and correlation checks as a pre-capital gate
- Stress scenarios (AI CapEx pause, energy shock, rates reprice)
- Sizing aids from volatility, conviction, liquidity
- ~~Drawdown kill-switch workflows aligned with [mandate.md](./mandate.md)~~
  **Encoded (2026-08 → 09).** `shouldHaltNewRiskForKillSwitch` in
  `packages/domain/src/mandate.ts`, enforced in `lib/mandate/enforce.ts` and
  surfaced on Briefing; it halts new risk only above the capital Phase-1 cap.
  Two deployed-drawdown diagnostics have actually been run and persisted
  (2026-08-30, 2026-09-03).

**Measurement integrity is a prerequisite, not a detail.** A kill-switch is only
as good as the series it reads. Until 2026-09-02 the published max deployed
drawdown was 25.1% against a true 16.4% — snapshots were stamped by wall-clock
rather than by cash session, so a late cron fabricated returns. Anything added
above must state which stored series it trusts and what proves that series
true. See the [remediation log](./reviews/2026-09-03-remediation-log.md) §2.

Exit criteria: risk view is checked before every new risk; violations are visible and blocking by policy.

## Phase 4 — Insight product / other capital (optional)

**Goal:** Extend only after the personal process has evidence.

Paths (in rough order of complexity):

1. Research/insight product (notes, theme dashboards, signal rationale)
2. Advisory / separately managed style offerings (regulatory heavy)
3. Fund vehicle (legal/compliance becomes a core workstream)

Exit criteria: deliberate go/no-go; no premature multi-tenant complexity before software Phases 1–3 are real. Do not solicit outside capital until **capital Phase 4** proofs in the mandate are met.

## Near-term execution

1. [x] Freeze Phase 0 docs (iterate lightly as we learn).
2. [x] Choose initial free data sources (Tiingo/Yahoo bars + Yahoo fundamentals; EDGAR later).
3. [x] Scaffold monorepo + DB schema.
4. [x] Connect UI to Supabase (auth + CRUD).
5. [x] Manual research workflow for a starter universe (~15–30 names across core themes).
6. [x] Ship one automated scorer (e.g. growth/CapEx inflection + anti-parabolic filter). Shadow `fundamental_inflection_v1` on Explore + Signals; not wired to Briefing or the buy gate.
7. [x] Establish weekly review ritual (queue + book; later, review writes into the queue). Running since 2026-08-15: 34 `hold` decisions across eight roughly-weekly dates, the last covering all eight open names (2026-09-05). Monthly book pass, opportunity ranking and two drawdown diagnostics are persisted as `scope: portfolio` review tasks. Reviews now write into the queue, and the historical gate makes reading prior conclusions a precondition for completing a comparable one.
8. [x] Backfill written invalidation criteria for all open positions missing them (mandate rule 4). Written to the book 2026-08-13; enter-decision invalidation now copies onto the open position.
9. [x] Set the deployment-ladder baseline tranche: **~$10k/month** (decided 2026-08-13), reaching the **capital** Phase-1 $75k cap ~January 2027. Acceleration-tranche sizes for the −10%/−20% triggers still to be set at a monthly review.
10. [x] Minimum viable risk view (correlation matrix + AI-capex stress) before deployed cost crossed ~$40–50k (software Phase 3 pull-forward). Workbench → Risk, 2026-08-14.
11. [ ] Decision-grade dossiers state **normal / attractive / dislocation / panic** valuation zones (scenario vs price, not a raw % drawdown). Process: [mandate.md](./mandate.md) and [gpt-agent-process.md](./gpt-agent-process.md) ritual 9.

## Sequencing principles

- **Human-in-the-loop** for live capital until proven otherwise.
- **Explainable signals** over opaque models in year one.
- **Backtest factors and ideas**, not endless entry-curve fitting.
- **Reliability over novelty** in ingestion and bookkeeping.
- Document design decisions under `architecture/` as they are made.
- Software phases support the PM; they do not authorize more invested cost. That is the capital plan.

## Status

| Phase | Status |
|-------|--------|
| 0 — Operating model | Complete |
| 1 — Research OS | In progress. Watchlist, dossiers, book, deployment queue, journal, review queue and the agent API are live, and the weekly ritual has run since 2026-08-15. Open: filings/earnings links on dossiers, signal inbox CRUD. |
| 2 — Data & quant pipelines | Input layer plus point-in-time vintages, as-of scoring and a replay harness. Exit criterion **not** met, and now known to be further off: the first scorer measured worse than its universe. |
| 3 — Risk & portfolio construction | Minimum slice live (Workbench → Risk); kill-switch encoded and diagnostics run. Full pre-capital gate not met. |
| 4 — Insight product / other capital | Not started |
