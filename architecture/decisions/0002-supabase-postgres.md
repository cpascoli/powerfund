# ADR 0002: Supabase (Postgres) as system of record

## Status

Accepted

## Context

We need a reliable relational store for instruments, themes, documents, signals, positions, decisions, and portfolio snapshots. Auth will be required once the UI mutates data. Local iteration should be easy.

## Decision

Use **Supabase-hosted Postgres patterns** with the Supabase CLI for local development:

- Schema and seeds under `supabase/`
- RLS enabled on all `public` tables from the first migration
- Phase 1 access model: any `authenticated` user (single-operator)
- Typed client in `@powerfund/db`

Remote project linking can wait until we are ready to persist real portfolio data beyond local resets.

## Consequences

- Fast local loop via `supabase start` / `db reset`.
- RLS policies will need tightening for multi-user/org later.
- Generated DB types in `packages/db` should be refreshed when migrations change (manual for now; automate later).