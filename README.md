# Power Fund

Investment intelligence for managing and growing capital — thematic focus on AI infrastructure, energy, robotics/AI, and defence, with risk management and capital preservation as hard constraints.

## Docs

- **[docs/](./docs/README.md)** — goals, mandate, plan, themes, UX
- **[docs/deploy.md](./docs/deploy.md)** — GitHub → Netlify CI and Supabase remote
- **[architecture/](./architecture/README.md)** — system design, data model, ADRs

## Repo layout

```text
apps/web          Research OS (Next.js)
apps/worker       Ingestion/scoring stub
packages/domain   Shared types, themes, risk defaults
packages/db       Typed Supabase client
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
supabase status -o env   # copy API_URL + ANON_KEY
```

Create `apps/web/.env.local` from [`.env.example`](./.env.example). Sign up locally (email confirmations off), then use Explore.

### Worker stub

```bash
pnpm dev:worker
```

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
| `pnpm dev:worker` | Start worker stub |
| `pnpm build` | Build all packages/apps |
| `pnpm typecheck` | Typecheck all workspaces |
| `pnpm db:reset` | Reset local DB (migrate + seed) |
| `pnpm deploy:prod` | Manual Netlify production deploy |

## Status

Phase 1 Research OS: auth, watchlist, dossiers (stubs), Netlify + hosted Supabase. Next: dossier editing + decision journal.
