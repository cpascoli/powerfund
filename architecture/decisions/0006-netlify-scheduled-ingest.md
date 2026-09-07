# ADR 0006: EOD ingest via GitHub Actions

## Status

Accepted

## Context

Daily closes must land in `market_bars` after the NYSE/NASDAQ cash session without a laptop job. CoinStrat / PowerWallet use Netlify **scheduled** functions that kick **background** functions (`-background` suffix, 15-minute limit) because scheduled functions are capped at ~30s.

Power Fund is Next.js on Netlify’s OpenNext adapter. On this site, scheduled functions show a **Scheduled** badge and accept **Run now**, but the handler never runs: no Function logs, no Function Metrics row, no DB writes. That held for v2 `export default`, v1 `handler`, global esbuild on and off, toml + inline cron, and an hourly heartbeat probe. PowerWallet’s Vite SPA does not have this failure.

ADR 0004 already keeps heavy work in `apps/worker`. The worker CLI is the path that has actually written production bars.

## Decision

- **GitHub Actions** is the production scheduler (`.github/workflows/scheduled-ingest.yml`).
- Bars: `37 22 * * 1-5` (22:37 UTC weekdays ≈ 18:37 ET). Runs `ingest:bars --days=7` then `snapshot:portfolio`. `ingest:bars` also scores `fundamental_inflection_v1`.
- Fundamentals: `37 8 * * 0` (Sunday 08:37 UTC). Runs `ingest:fundamentals` (SEC companyfacts, Yahoo hole-fill), which also scores.
- **Both are deliberately off the hour.** GitHub creates scheduled runs best-effort and is worst at `:00`. On `0 22`, 11 measured runs landed a median **176 minutes** late and one **474 minutes** late, with **zero runner wait** — the delay was entirely in GitHub's scheduler, not in capacity, so a bigger runner would not have helped. Nothing was ever skipped. Lateness is a freshness problem rather than a correctness one, because snapshots are keyed on the cash session: a run at 05:54 the next morning writes the same rows. If punctuality ever does matter, drive `workflow_dispatch` from an external scheduler rather than trusting `schedule`.
- `workflow_dispatch` runs either job immediately (Actions → Scheduled ingest → Run workflow).
- Repository secrets (never `NEXT_PUBLIC_*` for the service role): `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, optional `TIINGO_API_KEY`.
- Local `pnpm ingest:bars` / `pnpm ingest:fundamentals` remain for backfill and one-off runs.
- Netlify `ingest-*-background` functions stay as an optional HTTP trigger (`Authorization: Bearer CRON_SECRET`). They are not the scheduler.

## Consequences

- Book of record stays EOD bars in Postgres; page-load Yahoo quotes are a display overlay only
- Ingest logs live on the GitHub Actions run, not the Netlify Functions page
- Service role lives as a GitHub Actions secret (and may still exist on Netlify for the unused background HTTP path)
- Full 2-year ingest stays on the worker CLI, not the cron
- Do not treat a Netlify Scheduled badge or “Functions invoked successfully” toast as evidence the job ran
