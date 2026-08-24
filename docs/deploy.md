# Deploy

How Power Fund reaches production: **GitHub → Netlify (frontend)** and **Supabase CLI/dashboard (database)**.

## Frontend (Netlify CI)

Build config lives in root [`netlify.toml`](../netlify.toml).

| Setting | Value |
|---------|--------|
| Base directory | *(empty / repo root)* |
| Build command | from `netlify.toml` |
| Publish | from `netlify.toml` (`apps/web/.next`) |
| Node | 22 |

### One-time: GitHub + continuous deploy

1. Create a GitHub repo and push `main` (see [README](../README.md)).
2. Netlify UI → site **powerfund** → **Project configuration → Build & deploy → Continuous deployment → Link repository**.
3. Select the GitHub repo; leave base directory **empty** (root).
4. Confirm Production branch is `main`.
5. Ensure Production env vars exist (Site configuration → Environment variables), scoped to **Builds and Functions** (not Builds-only):
   - `NEXT_PUBLIC_SUPABASE_URL` — Project URL (Settings → API Keys / Data API)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — **anon** / **publishable** key only
   - `SUPABASE_SERVICE_ROLE_KEY` — **private** (optional HTTP kick of `ingest-*-background`; never `NEXT_PUBLIC_*`)
   - `CRON_SECRET` — **private** shared secret for that optional HTTP kick
   - `POWERFUND_AGENT_API_KEYS` — **private** JSON array of agent API keys (see [agent-api.md](./agent-api.md))
   - `TIINGO_API_KEY` — optional, **private**; preferred for daily bars
6. **Do not** expose `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `POWERFUND_AGENT_API_KEYS`, or `TIINGO_API_KEY` as `NEXT_PUBLIC_*`.
7. Trigger a deploy (push to `main` or **Trigger deploy**). After changing `NEXT_PUBLIC_*`, trigger a **new** deploy so Next.js rebuilds with the values.

After linking, every push to `main` that touches the web app, shared packages, worker ingest, or `netlify/functions` deploys Production. The `ignore` rule in `netlify.toml` skips builds when only docs/supabase change.

### GitHub Actions secrets (production cron)

Same values as the worker CLI, as **repository** secrets (Settings → Secrets and variables → Actions):

- `SUPABASE_URL` — hosted project URL (or set `NEXT_PUBLIC_SUPABASE_URL` instead)
- `SUPABASE_SERVICE_ROLE_KEY` — **private** service role
- `TIINGO_API_KEY` — optional, **private**; preferred for daily bars

### Nightly EOD bars

GitHub Actions (not Netlify cron). Weekdays at **22:00 UTC**, [scheduled-ingest.yml](../.github/workflows/scheduled-ingest.yml) runs `ingest:bars --days=7` then `snapshot:portfolio`. OpenNext on this site registers Netlify scheduled functions but never invokes them — do not look for logs on the Functions page. See [ADR 0006](../architecture/decisions/0006-netlify-scheduled-ingest.md).

Repository secrets: `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`), `SUPABASE_SERVICE_ROLE_KEY`, optional `TIINGO_API_KEY`. To run immediately: **Actions → Scheduled ingest → Run workflow → bars**.

Historical backfill stays local: `pnpm ingest:bars`.

### Weekly fundamentals

Sundays at **08:00 UTC**, the same workflow runs `ingest:fundamentals` (SEC companyfacts, Yahoo fills sparse FCF/capex/net-debt and newer quarters). Manual: **Run workflow → fundamentals**. Local: `pnpm ingest:fundamentals`.

### Manual CLI deploy (fallback)

```bash
pnpm deploy:prod
```

## Database (Supabase)

Schema is **not** deployed by Netlify. From a machine with the CLI linked to the project:

```bash
supabase db push          # migrations
# optional starter data:
# run supabase/seed.sql in the SQL editor, or via CLI against the linked project
```

Auth URL config (hosted project):

- Site URL: `https://powerfund.netlify.app`
- Redirect URLs: `https://powerfund.netlify.app/**` (plus local URLs if needed)
