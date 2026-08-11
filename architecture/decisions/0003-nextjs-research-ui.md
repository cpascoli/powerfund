# ADR 0003: Next.js App Router for the research UI

## Status

Accepted

## Context

Phase 1 is an operator Research OS: themes, signals, portfolio, decision journal. We want a modern TypeScript UI that can later add auth and server-side data fetching against Supabase.

## Decision

Build `apps/web` with **Next.js (App Router) + React**.

- App shell with routes for Overview, Themes, Signals, Portfolio, Decisions
- Shared domain constants rendered before live DB wiring
- Supabase env helpers stubbed; full auth/CRUD in a follow-up

## Consequences

- Good fit for SSR/server components when we connect Supabase.
- UI stays human-in-the-loop; no trading gateway in this app.