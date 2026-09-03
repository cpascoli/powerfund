# Agent API

Private, authenticated domain API for AI agents (ChatGPT, MCP, etc.). It is **not** the public catalog and **not** trade execution. Operating rituals (daily sweep, weekly holds, calendar fill, new names): [gpt-agent-process.md](./gpt-agent-process.md).

Public anonymous catalog: [`/api/v1`](https://powerfund.netlify.app/api/v1) — weights and research text only.

Private agent API: `/api/v1/agent/*` — Bearer token, scoped permissions, dollars, versions, journal pins, deployment queue, review queue.

## What an agent may do

| Operation | Mutates | Notes |
|-----------|---------|--------|
| `getFundState` | no | Compact current investment state |
| `getPortfolio` | no | Private book from the ledger. Marks include `last_close_session` and `price_data_through`. Flags include the kill-switch: `due: false` means the 15% condition is live but ritual 11 is done for this breach. TWR is `getPerformance` |
| `getPerformance` | no | NAV and deployed TWR vs SPY/QQQ, unitized drawdowns, and dollar contribution by ticker / theme / factor. Optional `from`/`to`. Percent returns. `price_data_through` is the last session, not `as_of` |
| `getJournal` | no | Decisions + pinned `dossier_version`, fill-based 30/90/180d vs SPY, append-only outcomes. `price_data_through` is the last bar used |
| `getCompanyDossier` | no | Live research object. Includes `last_close` / `last_close_session` and `price_data_stale` |
| `getDossierVersions` / `getDossierVersion` | no | Immutable snapshots. No diff endpoint — fetch two versions and compare |
| `updateDossier` | live dossier | New version **only if** assembled JSON changed |
| `createDecision` | journal insert | Auto-pins current dossier version |
| `recordDecisionOutcome` | child row | Structured grade. Does **not** set `reviewed_at` or complete a weekly hold |
| `getPlannedActions` | no | Open deployment queue |
| `createPlannedAction` / `updatePlannedAction` | queue only | Never books a fill |
| `getReviewQueue` | may mark due | Open queue **and** completed history. Evaluates triggers; never writes the ledger. A completed-only query does not evaluate, so reading history cannot mutate the queue |
| `createReviewTask` / `updateReviewTask` | review queue | Not a planned trade |
| `completeReviewTask` | review row + links | Does not create dossiers, decisions, or fills |
| `addWatchlistCompany` | `instruments` + primary theme | Status is always `watchlist`. No dossier, queue, or fill |

Humans still confirm fills in the UI. There is no agent path to `transactions`, `bookFill`, cash movement, or SQL. `planned_actions` are intended trades. `review_tasks` are dated obligations: company/theme catalysts, or `scope: portfolio` book reviews (monthly pass, quarterly review, stress diagnostic, capital-phase gates). A review trigger must never create a transaction. Cadence and what to persist: [gpt-agent-process.md](./gpt-agent-process.md).

## Authentication

Set `POWERFUND_AGENT_API_KEYS` on the server (Netlify env, never `NEXT_PUBLIC_*`, never commit it).

```json
[
  {
    "name": "chatgpt",
    "secret": "replace-with-a-long-random-token",
    "role": "write"
  },
  {
    "name": "chatgpt-readonly",
    "secret": "another-long-random-token",
    "role": "read"
  }
]
```

`role` is a shortcut:

- `read` → `powerfund:state:read`, `powerfund:portfolio:read`, `powerfund:dossier:read`, `powerfund:journal:read`, `powerfund:deployment:read`, `powerfund:reviews:read`
- `write` → all read scopes plus `powerfund:dossier:write`, `powerfund:journal:append`, `powerfund:deployment:write`, `powerfund:reviews:write`, `powerfund:watchlist:write`

Or pass `"scopes": ["powerfund:state:read", ...]` explicitly.

Send:

```
Authorization: Bearer <secret>
```

### Upgrade path

This is not an OAuth authorization server. The same scope strings are the contract. A later ChatGPT/MCP OAuth connector can issue tokens that carry those scopes; route handlers keep checking scopes, not which IdP minted the token. Human UI login stays Supabase cookies + `app_users.role`.

## Idempotency

On mutating `POST` and `PATCH` agent routes send:

```
Idempotency-Key: <uuid>
```

That includes `POST` decisions, decisions/{id}/outcome, planned-actions, review-tasks, review-tasks complete, and watchlist, plus `PATCH` planned-actions, review-tasks, and dossiers. A retry with the same key and body returns the original result. A reused key with a different body returns `409 IDEMPOTENCY_KEY_REUSED`.

## Example curl

Replace `$ORIGIN` and `$TOKEN`.

```bash
ORIGIN=https://powerfund.netlify.app
TOKEN=your-agent-token

# Index (auth) + OpenAPI (public, for GPT Actions import)
curl -sS -H "Authorization: Bearer $TOKEN" "$ORIGIN/api/v1/agent"
curl -sS "$ORIGIN/api/v1/agent/openapi.json"

# Fund state
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$ORIGIN/api/v1/agent/state?recent_decisions=20&include_watchlist=true"

# Private portfolio
curl -sS -H "Authorization: Bearer $TOKEN" "$ORIGIN/api/v1/agent/portfolio"

# Performance (percent returns; dollar contribution by ticker/theme/factor)
curl -sS -H "Authorization: Bearer $TOKEN" "$ORIGIN/api/v1/agent/performance"
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$ORIGIN/api/v1/agent/performance?from=2026-08-12&to=2026-08-22"

# Journal
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$ORIGIN/api/v1/agent/journal?symbol=MRCY&limit=20"

# Deployment queue
curl -sS -H "Authorization: Bearer $TOKEN" "$ORIGIN/api/v1/agent/deployment-queue"

# Current dossier
curl -sS -H "Authorization: Bearer $TOKEN" "$ORIGIN/api/v1/agent/companies/MRCY"

# Version headers (number, change_reason, created_at — no snapshot bodies)
curl -sS -H "Authorization: Bearer $TOKEN" "$ORIGIN/api/v1/agent/companies/MRCY/versions"

# One snapshot by version_number or UUID. There is no diff endpoint:
# fetch v2 and v3 and compare thesis / invalidation / source in the client.
curl -sS -H "Authorization: Bearer $TOKEN" "$ORIGIN/api/v1/agent/companies/MRCY/versions/2"
curl -sS -H "Authorization: Bearer $TOKEN" "$ORIGIN/api/v1/agent/companies/MRCY/versions/3"

# Update dossier (creates version 4 only if assembled JSON changed)
curl -sS -X PATCH -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "expected_version": 3,
    "change_reason": "Q1 FY27 earnings re-underwrite",
    "actor_name": "chatgpt",
    "changes": {
      "summary": "...",
      "thesis": "...",
      "invalidation": "..."
    }
  }' \
  "$ORIGIN/api/v1/agent/companies/MRCY/dossier"

# Journal a hold, pinned to the current dossier version
curl -sS -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 11111111-1111-1111-1111-111111111111" \
  -d '{
    "symbol": "MRCY",
    "decision_type": "hold",
    "thesis": "Thesis intact after the print."
  }' \
  "$ORIGIN/api/v1/agent/decisions"

# Structured outcome on an existing journal row (does not set reviewed_at)
curl -sS -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 66666666-6666-6666-6666-666666666666" \
  -d '{
    "thesis_grade": "correct",
    "timing_grade": "poor",
    "sizing_grade": "good",
    "risk_management_grade": "good",
    "lessons": "Right company, chased the first print."
  }' \
  "$ORIGIN/api/v1/agent/decisions/DECISION_UUID/outcome"

# Propose a second tranche (does not trade)
curl -sS -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 22222222-2222-2222-2222-222222222222" \
  -d '{
    "symbol": "CLS",
    "action_type": "add",
    "planned_usd": 15000,
    "window_label": "price_below:290",
    "rationale": "Second tranche if thesis remains intact"
  }' \
  "$ORIGIN/api/v1/agent/planned-actions"

# Defer a queued action
curl -sS -X PATCH -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 55555555-5555-5555-5555-555555555555" \
  -d '{"status":"deferred"}' \
  "$ORIGIN/api/v1/agent/planned-actions/PLAN_ACTION_UUID"

# Review queue (evaluates triggers, then lists)
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$ORIGIN/api/v1/agent/review-queue?status=due"

# Review history — the prior beliefs the historical review gate requires.
# The last five completed reviews touching a name, company/theme/macro alike:
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$ORIGIN/api/v1/agent/review-queue?status=completed&symbol=CRDO&limit=5"

# Every book-level conclusion since the previous monthly pass:
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$ORIGIN/api/v1/agent/review-queue?status=completed&scope=portfolio&completed_since=2026-09-01"

# Schedule a post-Jackson-Hole re-underwrite
curl -sS -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 33333333-3333-3333-3333-333333333333" \
  -d '{
    "title": "Reassess energy sleeve after Jackson Hole",
    "instructions": "Re-read the energy thesis if the chair signals a slower cut path.",
    "scope": "theme",
    "priority": "high",
    "themes": ["energy"],
    "trigger": {
      "type": "event_window",
      "not_before": "2026-08-22T00:00:00Z",
      "due_by": "2026-08-29T00:00:00Z"
    }
  }' \
  "$ORIGIN/api/v1/agent/review-tasks"

# Price-condition review (auto-due when the close is evaluable)
curl -sS -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Revisit MRCY if the print is given back",
    "instructions": "If the post-earnings gap fills, re-underwrite sizing.",
    "scope": "company",
    "symbols": ["MRCY"],
    "trigger": {
      "type": "condition",
      "metric": "price",
      "symbol": "MRCY",
      "operator": "lt",
      "value": 50
    }
  }' \
  "$ORIGIN/api/v1/agent/review-tasks"

# Enrich a review's "what to do" text (cannot set due or completed)
curl -sS -X PATCH -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 66666666-6666-6666-6666-666666666666" \
  -d '{
    "instructions": "Check weekly close vs the August low, volume on the bounce, and whether invalidation still holds. Do not queue a buy unless the structure confirms."
  }' \
  "$ORIGIN/api/v1/agent/review-tasks/REVIEW_TASK_UUID"

# Complete a review, linking work that already exists
curl -sS -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "outcome": "Thesis intact; no change to the book.",
    "outputs": [
      { "kind": "decision", "entity_id": "DECISION_UUID" }
    ]
  }' \
  "$ORIGIN/api/v1/agent/review-tasks/REVIEW_TASK_UUID/complete"

# Add a research name (not a trade, not a dossier)
curl -sS -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 44444444-4444-4444-4444-444444444444" \
  -d '{
    "symbol": "HII",
    "name": "Huntington Ingalls",
    "theme": "defence",
    "notes": "Shipbuilding / navy"
  }' \
  "$ORIGIN/api/v1/agent/watchlist"
```

Optional `target_weight_pct` on create/update is converted to `planned_usd` using current NAV. The stored field remains `planned_usd`.

## Review triggers

Triggers are declarative JSON. No JavaScript or SQL.

| Type | Shape | Becomes `due` when |
|------|-------|--------------------|
| `scheduled` | `{ "type": "scheduled", "at": "<iso>" }` | `asOf >= at` |
| `event_window` | `{ "type": "event_window", "not_before": "<iso>", "due_by": "<iso>" }` | `asOf >= not_before` (`due_by` is the deadline; the task stays due after the window) |
| `condition` | `{ "type": "condition", "metric", "symbol", "operator", "value", "lookback_days?" }` | Evaluable metric matches |

v1 auto-evaluates `price` and `price_return_pct` against `market_bars`. Other metrics (for example backlog) may be stored with `evaluable: false` and wait for an agent. Operators: `lt`, `lte`, `gt`, `gte`, `eq`.

`GET /review-queue` and `GET /state` evaluate pending tasks first. Only `pending` → `due`. PATCH cannot set `due` or `completed`.

## Review history filters

Completed outcomes are the book's portfolio memory — the conclusions that live
nowhere else, unlike company memory (dossiers and their versions) and decision
memory (the journal). [gpt-agent-process.md](./gpt-agent-process.md#historical-review-gate)
requires loading the relevant ones before completing a comparable review, so
`getReviewQueue` filters rather than returning the whole archive.

| Parameter | Meaning |
|-----------|---------|
| `status` | `open` (default), `all`, or one or more of `pending`, `due`, `in_progress`, `completed`, `deferred`, `cancelled`, comma-separated |
| `scope` | `company`, `theme`, `macro`, `portfolio` |
| `symbol` / `symbols` | Ticker or comma-separated list. Matches any review **linked** to the name — a macro review that listed it counts, because it carries a prior belief |
| `theme` / `themes` | Theme slug or name, or a list |
| `completed_since` / `completed_before` | ISO date or datetime on `completed_at`. A bare date is the start of that UTC day |
| `limit` | Default 100, maximum 500 |
| `order` | `asc` / `desc`. Defaults to `desc` for a completed-only query, `asc` otherwise |
| `evaluate` | Defaults true, except on a completed-only query where it defaults false |

The response echoes the applied `filter`, plus `returned` and `truncated`.
`truncated: true` means more rows match than were returned — raise `limit` or
narrow the window, because a truncated history is a partial chain of reasoning.

## Errors

```json
{
  "error": {
    "code": "DOSSIER_VERSION_CONFLICT",
    "message": "Expected version does not match current version 5.",
    "current_version": 5
  }
}
```

| HTTP | Code |
|------|------|
| 401 | `UNAUTHENTICATED` |
| 403 | `PERMISSION_DENIED` |
| 404 | `UNKNOWN_SYMBOL` / `UNKNOWN_THEME` / `UNKNOWN_VERSION` / `UNKNOWN_PLANNED_ACTION` / `UNKNOWN_REVIEW_TASK` / `UNKNOWN_DECISION` |
| 409 | `DOSSIER_VERSION_CONFLICT` / `IDEMPOTENCY_KEY_REUSED` / `SYMBOL_EXISTS` |
| 422 | `VALIDATION_ERROR` |
| 429 | `RATE_LIMITED` |
| 500 | `DOSSIER_VERSIONING_FAILED` / `INTERNAL_ERROR` |

## MCP / ChatGPT mapping

These `operationId`s are stable tool names. A later MCP server can wrap each HTTP operation without changing domain semantics:

| MCP tool | HTTP |
|----------|------|
| `getFundState` | `GET /api/v1/agent/state` |
| `getPortfolio` | `GET /api/v1/agent/portfolio` |
| `getPerformance` | `GET /api/v1/agent/performance` |
| `getJournal` | `GET /api/v1/agent/journal` |
| `getPlannedActions` | `GET /api/v1/agent/deployment-queue` |
| `getReviewQueue` | `GET /api/v1/agent/review-queue` |
| `getCompanyDossier` | `GET /api/v1/agent/companies/{symbol}` |
| `getDossierVersions` | `GET /api/v1/agent/companies/{symbol}/versions` |
| `getDossierVersion` | `GET /api/v1/agent/companies/{symbol}/versions/{version}` |
| `updateDossier` | `PATCH /api/v1/agent/companies/{symbol}/dossier` |
| `createDecision` | `POST /api/v1/agent/decisions` |
| `recordDecisionOutcome` | `POST /api/v1/agent/decisions/{id}/outcome` |
| `createPlannedAction` | `POST /api/v1/agent/planned-actions` |
| `updatePlannedAction` | `PATCH /api/v1/agent/planned-actions/{id}` |
| `createReviewTask` | `POST /api/v1/agent/review-tasks` |
| `updateReviewTask` | `PATCH /api/v1/agent/review-tasks/{id}` |
| `completeReviewTask` | `POST /api/v1/agent/review-tasks/{id}/complete` |
| `addWatchlistCompany` | `POST /api/v1/agent/watchlist` |

Do not generate tools for table CRUD, SQL, or fill confirmation.

Typical workflows:

**New name or live rewrite**

1. `getFundState`
2. `addWatchlistCompany` if the ticker is not in the universe yet (`theme` must already exist)
3. `getCompanyDossier("MRCY")`
4. `getDossierVersions` then `getDossierVersion` for any prior snapshot you need to compare (v2 vs v3, or vs a journal pin). There is no diff tool.
5. external research
6. user approval
7. `updateDossier` (creates version 1 if none exists; later writes version only if assembled JSON changed)
8. optionally `createDecision` / `createPlannedAction` (`buy` for a first entry, `add` for a second tranche) / `createReviewTask`

**Scoreboard vs SPY / QQQ**

1. `getPerformance` (optional `from` / `to` as `YYYY-MM-DD`)
2. Read `price_data_through` / `price_data_stale` before treating marks as the last completed US cash session
3. Read `drawdown.nav_max_pct` and `drawdown.deployed_max_pct` (unitized; percent)
4. Compare window `nav_return_pct` and `deployed_return_pct` to `spy_return_pct` / `qqq_return_pct`
5. Read `contribution.tickers` / `themes` / `factors` (`pnl_usd` is dollars, not TWR)
6. Per-decision 30/90/180d vs SPY is on `getJournal` (`relative_returns`, keyed off the linked fill session). Do not read TWR from `getPortfolio`.

**What we believed when we bought it**

1. `getJournal?symbol=MRCY`
2. `getDossierVersion` with the pinned `dossier_version` id or number on that row
3. Read `relative_returns` (fill session, not `action_at`) and any `outcomes`
4. Do not use the live dossier as a proxy for that date

**Tighten a review already on Dated**

1. `getReviewQueue` (or `getFundState`) to get the task id
2. `updateReviewTask` with `instructions` (and optionally `title`, `trigger`, `symbols` / `themes`)
3. Status may be `pending`, `in_progress`, `deferred`, or `cancelled`. Triggers mark `due`; `completeReviewTask` records the outcome.

Machine-readable contract: `GET /api/v1/agent/openapi.json` (public, no Bearer token). ChatGPT Actions can import that URL. Configure the GPT's authentication separately as API key / Bearer for the actual operations. The schema is OpenAPI 3.1.0, with no `oneOf`/`anyOf`/`$ref`, so Actions can parse every tool including `createReviewTask.trigger`.
