# ADR 0006: EOD ingest via Netlify scheduled + background functions

## Status

Accepted

## Context

Daily closes must land in `market_bars` after the NYSE/NASDAQ cash session without a laptop job. CoinStrat already uses the same host: a short **scheduled** function kicks a **background** function (`-background` suffix, 15-minute limit) because scheduled functions are capped at ~30s.

ADR 0004 kept workers off Netlify. That still holds for long historical backfills and anything that belongs in `apps/worker` locally. Nightly *recent* bars are small enough for a background function.

## Decision

- `netlify/functions/scheduled-ingest-bars.ts` — cron `0 22 * * 1-5` (22:00 UTC weekdays ≈ 18:00 ET / 17:00 ET)
- Immediately POST `/.netlify/functions/ingest-bars-background` with `Authorization: Bearer CRON_SECRET`
- Background handler runs existing `ingestBars({ days: 7, pauseMs: 400 })`
- Private Netlify env (never `NEXT_PUBLIC_*`): `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, optional `TIINGO_API_KEY`
- Local `pnpm ingest:bars` remains for historical backfill

## Consequences

- Book of record stays EOD bars in Postgres; page-load Yahoo quotes are a display overlay only
- Service role lives on the Netlify site as a **server-only** secret (same pattern as CoinStrat)
- Deploy ignore list includes `netlify/` and `apps/worker` so ingest changes ship
- Full 2-year ingest stays on the worker CLI, not the cron
