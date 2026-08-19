# Power Fund

Investment intelligence for managing and growing capital — thematic focus on AI infrastructure, energy, robotics/AI, and defence, with risk management and capital preservation as hard constraints.

## Docs

- **[docs/](./docs/README.md)** — goals, mandate, plan, themes, UX
- **[docs/deploy.md](./docs/deploy.md)** — GitHub → Netlify CI and Supabase remote
- **[architecture/](./architecture/README.md)** — system design, data model, ADRs

## Repo layout

```text
apps/web          Research OS (Next.js)
apps/worker       Ingestion (bars + fundamentals)
netlify/functions Scheduled + background EOD ingest
packages/domain   Shared types, themes, risk defaults
packages/db       Typed Supabase client
packages/data-clients  Tiingo + Yahoo free market clients
supabase/         Migrations + seed
docs/             Product / mandate docs
architecture/     Engineering design docs
```

## Prerequisites

- Node 20+
- pnpm 9+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for local DB)

## Quick start

```bash
pnpm install
pnpm dev
```

Research UI: [http://127.0.0.1:3000](http://127.0.0.1:3000)

UX / navigation model: [docs/ux.md](./docs/ux.md) (Briefing, Explore, Signals, Workbench, Portfolio, Journal).

### Local database

```bash
supabase start
pnpm db:reset   # apply migrations + seed
supabase status -o env   # copy API_URL + ANON_KEY (+ SERVICE_ROLE_KEY for ingest)
```

Create `apps/web/.env.local` from [`.env.example`](./.env.example). Sign up locally (email confirmations off), then use Explore.

### Market data ingest (free tier)

Daily OHLCV + market cap + quarterly fundamentals (revenue, FCF, capex, net debt).

- Bars: Tiingo (if `TIINGO_API_KEY`) → Yahoo → Stooq
- Fundamentals: SEC companyfacts → Yahoo
- Free Tiingo key recommended for reliable daily bars: https://www.tiingo.com/

See [ADR 0005](./architecture/decisions/0005-free-market-data-vendors.md) and [ADR 0006](./architecture/decisions/0006-netlify-scheduled-ingest.md).

```bash
# apps/web/.env.local needs:
#   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
#   SUPABASE_SERVICE_ROLE_KEY   # from `supabase status` (local) — not the anon key
#   TIINGO_API_KEY=...          # optional but recommended

pnpm ingest:bars              # default ~2y daily bars + market caps
pnpm ingest:fundamentals      # quarterly fundamentals
pnpm ingest:all               # both
```

Production EOD: Netlify scheduled function (weekdays 22:00 UTC) kicks a **background** function that ingests the last 7 days. Weekly fundamentals (Sunday 08:00 UTC) uses the same kick pattern. Set `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, and optionally `TIINGO_API_KEY` on the Netlify site (never `NEXT_PUBLIC_*`).

## Git + Netlify CI

```bash
# after first commit on main:
gh auth login                 # if needed
gh repo create powerfund --private --source=. --remote=origin --push

# then link the existing Netlify site "powerfund" to this GitHub repo
# (UI: Project configuration → Build & deploy → Link repository)
# Base directory: leave empty (repo root). Details: docs/deploy.md
```

Production site: [https://powerfund.netlify.app](https://powerfund.netlify.app)

Manual deploy fallback:

```bash
pnpm deploy:prod
# netlify deploy --build --prod --filter @powerfund/web
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start web app |
| `pnpm ingest:bars` | Ingest daily bars + market caps |
| `pnpm ingest:fundamentals` | Ingest quarterly fundamentals |
| `pnpm ingest:all` | Run both ingest jobs |
| `pnpm build` | Build all packages/apps |
| `pnpm typecheck` | Typecheck all workspaces |
| `pnpm db:reset` | Reset local DB (migrate + seed) |
| `pnpm deploy:prod` | Manual Netlify production deploy |

## Status

Phase 1 Research OS: auth, watchlist, editable dossiers, decision journal, free-tier market ingest, Netlify + hosted Supabase.
