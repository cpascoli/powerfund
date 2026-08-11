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
5. Ensure Production env vars exist:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
6. Trigger a deploy (push to `main` or **Trigger deploy**).

After linking, every push to `main` that touches the web app or shared packages deploys Production. The `ignore` rule in `netlify.toml` skips builds when only docs/worker/supabase change.

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
