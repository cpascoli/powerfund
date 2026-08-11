# Stack

**Status:** Implemented scaffold (Phase 1)

| Layer | Choice |
|-------|--------|
| Language | TypeScript |
| Package manager | pnpm workspaces |
| Web | Next.js 15 App Router, React 19 |
| Web hosting | Netlify (monorepo build via `netlify.toml`) |
| Worker | Node + `tsx` (stub) |
| Database | Postgres via Supabase CLI/local |
| Shared packages | `@powerfund/domain`, `@powerfund/db` |

See ADRs under [decisions/](./decisions/).
