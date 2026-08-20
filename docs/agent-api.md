# Agent API

Private, authenticated domain API for AI agents (ChatGPT, MCP, etc.). It is **not** the public catalog and **not** trade execution.

Public anonymous catalog: [`/api/v1`](https://powerfund.netlify.app/api/v1) — weights and research text only.

Private agent API: `/api/v1/agent/*` — Bearer token, scoped permissions, dollars, versions, journal pins, deployment queue, review queue.

## What an agent may do

| Operation | Mutates | Notes |
|-----------|---------|--------|
| `getFundState` | no | Compact current investment state |
| `getPortfolio` | no | Private book from the ledger |
| `getJournal` | no | Decisions + pinned `dossier_version` |
| `getCompanyDossier` | no | Live research object |
| `getDossierVersions` / `getDossierVersion` | no | Immutable snapshots |
| `updateDossier` | live dossier | New version **only if** assembled JSON changed |
| `createDecision` | journal insert | Auto-pins current dossier version |
| `getPlannedActions` | no | Open deployment queue |
| `createPlannedAction` / `updatePlannedAction` | queue only | Never books a fill |
| `getReviewQueue` | may mark due | Evaluates triggers; never writes the ledger |
| `createReviewTask` / `updateReviewTask` | review queue | Not a planned trade |
| `completeReviewTask` | review row + links | Does not create dossiers, decisions, or fills |

Humans still confirm fills in the UI. There is no agent path to `transactions`, `bookFill`, cash movement, or SQL. `planned_actions` are intended trades. `review_tasks` are “reassess the thesis when X happens.” A review trigger must never create a transaction.

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
- `write` → all read scopes plus `powerfund:dossier:write`, `powerfund:journal:append`, `powerfund:deployment:write`, `powerfund:reviews:write`

Or pass `"scopes": ["powerfund:state:read", ...]` explicitly.

Send:

```
Authorization: Bearer <secret>
```

### Upgrade path

This is not an OAuth authorization server. The same scope strings are the contract. A later ChatGPT/MCP OAuth connector can issue tokens that carry those scopes; route handlers keep checking scopes, not which IdP minted the token. Human UI login stays Supabase cookies + `app_users.role`.

## Idempotency

On `POST /api/v1/agent/decisions`, `POST /api/v1/agent/planned-actions`, `POST /api/v1/agent/review-tasks`, and `POST /api/v1/agent/review-tasks/{id}/complete` send:

```
Idempotency-Key: <uuid>
```

A retry with the same key and body returns the original result. A reused key with a different body returns `409 IDEMPOTENCY_KEY_REUSED`.

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

# Journal
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$ORIGIN/api/v1/agent/journal?symbol=MRCY&limit=20"

# Deployment queue
curl -sS -H "Authorization: Bearer $TOKEN" "$ORIGIN/api/v1/agent/deployment-queue"

# Current dossier
curl -sS -H "Authorization: Bearer $TOKEN" "$ORIGIN/api/v1/agent/companies/MRCY"

# Version history + one snapshot (“what did we believe when we bought it?”)
curl -sS -H "Authorization: Bearer $TOKEN" "$ORIGIN/api/v1/agent/companies/MRCY/versions"
curl -sS -H "Authorization: Bearer $TOKEN" "$ORIGIN/api/v1/agent/companies/MRCY/versions/1"

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
  -d '{"status":"deferred"}' \
  "$ORIGIN/api/v1/agent/planned-actions/PLAN_ACTION_UUID"

# Review queue (evaluates triggers, then lists)
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$ORIGIN/api/v1/agent/review-queue?status=due"

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
| 404 | `UNKNOWN_SYMBOL` / `UNKNOWN_THEME` / `UNKNOWN_VERSION` / `UNKNOWN_PLANNED_ACTION` / `UNKNOWN_REVIEW_TASK` |
| 409 | `DOSSIER_VERSION_CONFLICT` / `IDEMPOTENCY_KEY_REUSED` |
| 422 | `VALIDATION_ERROR` |
| 429 | `RATE_LIMITED` |
| 500 | `DOSSIER_VERSIONING_FAILED` / `INTERNAL_ERROR` |

## MCP / ChatGPT mapping

These `operationId`s are stable tool names. A later MCP server can wrap each HTTP operation without changing domain semantics:

| MCP tool | HTTP |
|----------|------|
| `getFundState` | `GET /api/v1/agent/state` |
| `getPortfolio` | `GET /api/v1/agent/portfolio` |
| `getJournal` | `GET /api/v1/agent/journal` |
| `getPlannedActions` | `GET /api/v1/agent/deployment-queue` |
| `getReviewQueue` | `GET /api/v1/agent/review-queue` |
| `getCompanyDossier` | `GET /api/v1/agent/companies/{symbol}` |
| `getDossierVersions` | `GET /api/v1/agent/companies/{symbol}/versions` |
| `getDossierVersion` | `GET /api/v1/agent/companies/{symbol}/versions/{version}` |
| `updateDossier` | `PATCH /api/v1/agent/companies/{symbol}/dossier` |
| `createDecision` | `POST /api/v1/agent/decisions` |
| `createPlannedAction` | `POST /api/v1/agent/planned-actions` |
| `updatePlannedAction` | `PATCH /api/v1/agent/planned-actions/{id}` |
| `createReviewTask` | `POST /api/v1/agent/review-tasks` |
| `updateReviewTask` | `PATCH /api/v1/agent/review-tasks/{id}` |
| `completeReviewTask` | `POST /api/v1/agent/review-tasks/{id}/complete` |

Do not generate tools for table CRUD, SQL, or fill confirmation.

Typical workflow:

1. `getFundState`
2. `getCompanyDossier("MRCY")`
3. external research
4. user approval
5. `updateDossier`
6. optionally `createDecision` / `createPlannedAction` / `createReviewTask`

Machine-readable contract: `GET /api/v1/agent/openapi.json` (public, no Bearer token). ChatGPT Actions can import that URL. Configure the GPT's authentication separately as API key / Bearer for the actual operations. The schema is OpenAPI 3.1.0, with no `oneOf`/`anyOf`/`$ref`, so Actions can parse every tool including `createReviewTask.trigger`.
