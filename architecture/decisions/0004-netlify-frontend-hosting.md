# ADR 0004: Netlify for the research frontend

## Status

Accepted

## Context

The research UI will be the primary way to consume themes, dossiers, signals, datasets, and charts. Other personal apps already live on Netlify; Power Fund’s frontend should deploy the same way for a consistent operator workflow.

The repo is a pnpm monorepo; only `apps/web` (plus shared packages) should ship to Netlify. Workers and database stay elsewhere (local/Supabase/future job host).

## Decision

- Host **`@powerfund/web`** on **Netlify**
- Configure the monorepo build in root [`netlify.toml`](../../netlify.toml)
- Rely on Netlify’s **automatic Next.js runtime** (OpenNext) — do not pin `@netlify/plugin-nextjs` unless we need a freeze
- Pass `NEXT_PUBLIC_SUPABASE_*` as Netlify env vars when the UI is wired to a remote project

## Consequences

- Visual research exploration is continuously deployable alongside other Netlify sites
- Build must install the workspace from the repo root so `packages/*` resolve
- Ignore rules skip deploys when only docs/worker/supabase change
- Heavy viz and SSR stay within Next.js constraints on Netlify; extreme data jobs remain in `apps/worker`, not the edge request path
- Preferred path: **GitHub `main` → Netlify Production** (see [`docs/deploy.md`](../../docs/deploy.md)); `pnpm deploy:prod` remains a manual fallback
- `NEXT_PUBLIC_*` env vars must be set on the Production context and a new deploy run after changes
