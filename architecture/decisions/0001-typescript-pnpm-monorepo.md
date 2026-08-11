# ADR 0001: TypeScript pnpm monorepo

## Status

Accepted

## Context

Power Fund needs a research web app, background workers for ingestion/scoring, and shared domain types. We want one repo, shared packages, and a single install/tooling story from day one.

## Decision

Use a **pnpm workspaces** monorepo with TypeScript throughout:

- `apps/web` — Next.js research UI
- `apps/worker` — ingestion/scoring jobs (stub in Phase 1)
- `packages/domain` — shared types, theme constants, risk defaults
- `packages/db` — typed Supabase client helpers

## Consequences

- Shared domain language stays consistent across UI and workers.
- Requires Node 20+ and pnpm.
- Package boundaries must be kept intentional to avoid a tangle of cross-imports.