# Data Model

**Status:** Implemented (initial migration) — `supabase/migrations/20260811130000_init_schema.sql`

## Entities

```mermaid
erDiagram
  themes ||--o{ instrument_themes : tags
  instruments ||--o{ instrument_themes : tagged
  instruments ||--o{ documents : about
  instruments ||--o{ signals : about
  themes ||--o{ signals : about
  instruments ||--o{ positions : held
  instruments ||--o{ decisions : about
  positions ||--o{ decisions : linked
  signals ||--o{ decisions : linked
  portfolio_snapshots
```

| Table | Role |
|-------|------|
| `themes` | AI infra, Energy, Robotics/AI, Defence, Other |
| `instruments` | Tradable/watch entities |
| `instrument_themes` | Many-to-many with primary flag |
| `documents` | Filings, transcripts, press, etc. |
| `signals` | Manual or scorer-generated candidates |
| `positions` | Open/closed book |
| `decisions` | Thesis journal entries |
| `portfolio_snapshots` | Point-in-time NAV/cash/exposures |
| `dossiers` | Research stubs: thesis, risks, invalidation, next diligence |

## Enums

- `asset_class`: equity, etf, commodity_proxy, other
- `instrument_status`: watchlist, active, archived
- `signal_source`: manual, scorer
- `signal_status`: new, reviewing, acted, dismissed
- `position_status`: open, closed
- `position_side`: long, short
- `decision_type`: enter, add, reduce, exit, hold, watch
- `document_type`: 10-k, 10-q, 8-k, earnings, transcript, press, other

## Access

RLS enabled on all tables. Phase 1 policies: full CRUD for `authenticated`.

## Seed

`supabase/seed.sql` inserts core themes (idempotent on `slug`).

## TypeScript

- Domain shapes: `@powerfund/domain`
- DB row types: `@powerfund/db` (`Database` interface) — refresh when schema changes
