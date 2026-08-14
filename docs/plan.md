# Build Plan

Phased plan from operating discipline → research OS → data/quant platform → portfolio risk → optional scale.

## Phase 0 — Operating model

**Goal:** Define how we invest before we overbuild software.

Deliverables:

- [x] Project goals ([goals.md](./goals.md))
- [x] Mandate and risk rules ([mandate.md](./mandate.md))
- [x] Theme map ([themes.md](./themes.md))
- [x] This plan
- [x] Architecture folder for living design docs ([../architecture/README.md](../architecture/README.md))

Exit criteria: mandate and themes are clear enough to drive schema, UI, and first pipelines without re-litigating philosophy every week. **Met.**

## Phase 1 — Research OS (MVP) *(current)*

**Goal:** Make the operator a better portfolio manager.

Build:

- [x] TypeScript monorepo scaffold
- [x] Postgres schema (`themes`, `instruments`, `documents`, `signals`, `positions`, `decisions`, `portfolio_snapshots`)
- [x] Research UI shell + IA (Briefing, Explore, Signals, Workbench, Portfolio, Journal)
- [x] Netlify deploy config for the frontend
- [x] Worker ingest (daily bars + quarterly fundamentals via free APIs)
- [x] Netlify scheduled + background EOD bar ingest
- [x] Auth + Supabase client wiring (local)
- [x] Watchlists organized by theme (live data + starter universe seed)
- [x] Company dossiers (stub fields + CLS/VRT/NBIS research notes)
- [x] Dossier create/edit UI + market snapshot fields
- [ ] Filings/earnings links on dossiers
- [ ] Signal inbox CRUD (manual + later automated)
- [x] Portfolio book (open positions, cash, NAV, mandate weights)
- [x] Deployment queue (plan buy → confirm fill)
- [x] Decision journal CRUD (thesis → action → review)

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

## Phase 3 — Risk & portfolio construction

**Goal:** Fund-like discipline in software.

**Minimum slice pulled forward (2026-08-13 strategy review):** capital is live while this phase is "not started". Before deployed cost crosses ~$40–50k, stand up — even as a notebook, not a feature — (a) a pairwise correlation matrix of holdings and candidates, (b) an AI-capex factor exposure view (mandate rule 10), and (c) a standing "hyperscaler capex guidance −20%" stress scenario.

- Exposure by theme, factor, geography, commodity beta
- Concentration and correlation checks
- Stress scenarios (e.g. AI CapEx pause, energy shock, rates reprice)
- Sizing aids from volatility, conviction, liquidity
- Drawdown kill-switch workflows aligned with [mandate.md](./mandate.md)

Exit criteria: risk view is checked before every new risk; violations are visible and blocking by policy.

## Phase 4 — Insight product / other capital (optional)

**Goal:** Extend only after personal process has evidence.

Paths (in rough order of complexity):

1. Research/insight product (notes, theme dashboards, signal rationale)
2. Advisory / separately managed style offerings (regulatory heavy)
3. Fund vehicle (legal/compliance becomes a core workstream)

Exit criteria: deliberate go/no-go; no premature multi-tenant complexity before Phase 1–3 are real.

## Near-term execution (first ~30 days)

1. [x] Freeze Phase 0 docs (iterate lightly as we learn).
2. [x] Choose initial free data sources (Tiingo/Yahoo bars + Yahoo fundamentals; EDGAR later).
3. [x] Scaffold monorepo + DB schema.
4. [x] Connect UI to Supabase (auth + CRUD).
5. [x] Manual research workflow for a starter universe (~15–30 names across core themes).
6. [ ] Ship one automated scorer (e.g. growth/CapEx inflection + anti-parabolic filter).
7. [ ] Establish weekly review ritual (queue + book; later, review writes into the queue).
8. [x] Backfill written invalidation criteria for all open positions missing them (mandate rule 4 — flagged in the [strategy second opinion](./reviews/2026-08-13-strategy-second-opinion.md)). Written to the book 2026-08-13; visible per position on the Portfolio page.
9. [x] Set the deployment-ladder baseline tranche: **~$10k/month** (decided 2026-08-13), reaching the $75k Phase-1 cap ~January 2027. Acceleration-tranche sizes for the −10%/−20% triggers still to be set at a monthly review.
10. [x] Minimum viable risk view (correlation matrix + AI-capex stress scenario) before deployed cost crosses ~$40–50k (Phase 3 pull-forward). Workbench → Risk, 2026-08-14.

## Sequencing principles

- **Human-in-the-loop** for live capital until proven otherwise.
- **Explainable signals** over opaque models in year one.
- **Backtest factors and ideas**, not endless entry-curve fitting.
- **Reliability over novelty** in ingestion and bookkeeping.
- Document design decisions under `architecture/` as they are made.

## Status

| Phase | Status |
|-------|--------|
| Phase 0 — Operating model | Complete |
| Phase 1 — Research OS | In progress (watchlist/dossiers/journal + free market ingest) |
| Phase 2 — Data & quant pipelines | Started early (EOD bars + quarterly fundamentals ingest) |
| Phase 3 — Risk & portfolio construction | Minimum slice live (Workbench → Risk: correlation, crowding, capex-pause stress) |
| Phase 4 — Scale / insight product | Not started |