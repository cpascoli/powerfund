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
5. Ensure Production env vars exist (Site configuration → Environment variables):
   - `NEXT_PUBLIC_SUPABASE_URL` — Project URL (Settings → API Keys / Data API)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — **anon** / **publishable** key only
   - `SUPABASE_SERVICE_ROLE_KEY` — **private** (scheduled ingest only; never `NEXT_PUBLIC_*`)
   - `CRON_SECRET` — **private** shared secret for the background ingest trigger
   - `TIINGO_API_KEY` — optional, **private**; preferred for daily bars
6. **Do not** expose `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, or `TIINGO_API_KEY` as `NEXT_PUBLIC_*`.
7. Trigger a deploy (push to `main` or **Trigger deploy**). After changing `NEXT_PUBLIC_*`, trigger a **new** deploy so Next.js rebuilds with the values.

After linking, every push to `main` that touches the web app, shared packages, worker ingest, or `netlify/functions` deploys Production. The `ignore` rule in `netlify.toml` skips builds when only docs/supabase change.

### Nightly EOD bars

Weekdays at **22:00 UTC**, `scheduled-ingest-bars` kicks `ingest-bars-background` (15-minute budget) to upsert the last 7 days of daily bars. Same CoinStrat pattern: short cron, long background. See [ADR 0006](../architecture/decisions/0006-netlify-scheduled-ingest.md).

Historical backfill stays local: `pnpm ingest:bars`.

### Weekly fundamentals

Sundays at **08:00 UTC**, `scheduled-ingest-fundamentals` kicks `ingest-fundamentals-background` to refresh `fundamentals_quarterly` (SEC companyfacts, Yahoo fills sparse FCF/capex/net-debt and newer quarters). Local: `pnpm ingest:fundamentals`.

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
