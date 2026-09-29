# MCP tool catalog

The PowerFund MCP server's tools, what each is for, and how each maps onto the
[agent API](./agent-api.md). Architecture, auth and deployment are in
[mcp-architecture.md](./mcp-architecture.md).

> **REST API** = PowerFund's application interface · **MCP tools** = the
> agent's capability interface · **Skill** = how to run the book. This file is
> the middle one.

The catalog at the bottom is **generated from the tool definitions**
(`apps/web/src/lib/mcp/tools.ts`) and checked by `catalog.test.ts`, so it is
exactly what `tools/list` serves. Change a tool, then regenerate:

```bash
UPDATE_MCP_CATALOG=1 pnpm test -- catalog
```

## How the surface was designed

Not one tool per endpoint. Each tool is named for an outcome the agent is
after, described by *when* to use it, and grouped so a tool never mixes risks:

1. **Reads are separate from writes.** No tool both reads and writes.
2. **Each write tool is exactly one REST write.** Every write is something the
   operator approves on its own. A "do the review" tool that updated a dossier,
   journaled a decision and completed a task in one call would take three
   approvals and turn them into one.
3. **One composite, and it only reads.** `get_review_context` exists because the
   [historical review gate](./gpt-agent-process.md#historical-review-gate) needs
   four reads that are easy to get wrong. The easiest to skip is the portfolio
   chain, which `symbol=` can never reach. It fails as a whole rather than
   return a partial chain of reasoning.
4. **A curated surface, classified explicitly.** Every agent operation is
   listed in `lib/mcp/exposure.ts` as exposed or excluded with a reason, and
   `exposure.test.ts` fails on any unclassified route operation. Today all but
   the index are exposed, so the plugin loses nothing the GPT could do. That is
   a property of the table, not a rule that new endpoints become tools.
5. **No path the REST API does not have.** No fills, cash, transactions, SQL or
   mandate override. The REST routes take `mandate_override_reason` and a
   `trigger` on planned actions, but the GPT's OpenAPI never exposed them, so
   the tools do not either. Strict input schemas refuse them rather than drop
   them silently.

### The workflows it serves

| Prompt | Tools, in order |
|--------|-----------------|
| "What tasks are due today?" | `get_fund_state` (due reviews, due planned actions, flags) → `list_reviews {status:["due"]}` if thin |
| "Get the current portfolio and fund state." | `get_fund_state`, `get_portfolio` |
| "What is in the research inbox?" | `get_research_inbox` |
| "Get the SNDK dossier." | `get_dossier` |
| "Re-underwrite SNDK." | `get_review_context {symbol}` → research → approval → `update_dossier` (→ `record_decision`) |
| "Reassess the MRCY add trigger." | `get_review_context {symbol:"MRCY"}` (includes its open planned actions) → `get_portfolio` → approval → `update_planned_action` |
| "What conditions remain before allocating to KTOS?" | `get_review_context {symbol:"KTOS"}` → `get_portfolio` → `get_fund_state`. Read-only |
| "Record the outcome of this review." | `list_reviews` (find the task) → approval → `complete_review_task` |
| "Run the portfolio/calendar review." | `get_fund_state {include_watchlist}` → `list_reviews {status:["open"]}` → `create_review_task` / `update_review_task` per approved event |
| "Grade the decisions that are due." | `get_calibration_status` → `get_journal {horizon_due}` → `get_dossier_version` per pin → batch approval → `record_decision_outcome` ×N → `get_calibration_status` |

The prompt-level regression suite is [evals/mcp](../evals/mcp/README.md).

### Operations poorly suited to direct model exposure

These are exposed, but shaped to protect the model from its usual mistakes:

| Operation | Hazard | What the tool does |
|-----------|--------|--------------------|
| `updateDossier` | Overwriting newer work; `expected_version: 0` for a name with no dossier is refused by the database | `expected_version` is **required**; `null` means "no dossier yet" and is omitted on the wire |
| `recordDecisionOutcome` | Absent vs null `horizon_days` mean different things; `dossier_version.id` sent as the decision id | `horizon_days` required and nullable, sent explicitly; argument named `decision_id` |
| `createReviewTask` trigger | Free-form JSON; `scheduled_for` instead of `at`; `scheduled` for an estimated date | Discriminated union, strict per variant; descriptions say "confirmed" vs "estimated" |
| `updatePlannedAction` / `updateReviewTask` | Setting statuses the agent may not (`confirmed`, `due`, `completed`) | Status enums contain only what the agent may set |
| Any write | A timed-out call retried by the model writes twice | Server-derived idempotency key (tool + arguments), reserved before the write runs: a retry replays, or gets `IDEMPOTENCY_IN_PROGRESS` while the first attempt runs |
| `getReviewQueue` | Returns the archive when asked vaguely; `symbol` and `theme` are a union | Descriptions say so; `get_review_context` makes the common chain one call |

### Annotations

| Annotation | Rule |
|------------|------|
| `readOnlyHint: true` | The tool changes no state. Enforced by a test that runs every read tool against a recording client, and by `evaluate=preview` on the queue reads (below) |
| `destructiveHint: true` | The write replaces, withdraws or irreversibly closes something: `update_dossier` (live text), `update_planned_action` (can cancel an intended trade), `update_review_task` (can cancel), `set_watchlist_archived`, `complete_review_task` (no endpoint reopens a completed review) |
| `destructiveHint: false` on a write | Pure appends: a decision, a grade, a queued action, a new review, a new watchlist name |
| `idempotentHint` | True for reads and for updates that set a state; false for appends and for completion (a second completion is refused) |
| `openWorldHint: false` | Everywhere. Every tool touches only PowerFund's own store |

Annotations are hints to the client. They do not enforce anything. Authorization is the
scope check in the MCP server **and again** in `handleAgentRequest`.

**Review triggers are previewed, not latched, by MCP reads.** The REST reads
behind `get_fund_state` and `list_reviews` latch fired review triggers
(`pending → due`) by default. The MCP tools pass `evaluate=preview`, which
reports a fired trigger as `due` with `due_by_trigger: true` and writes nothing.
That makes `readOnlyHint: true` literally true.

The latch cannot simply be dropped. Date triggers are monotonic, but a price
condition is evaluated against the latest close and can stop being true: MRCY
closing at 49 against "revisit below 50", then recovering to 52, must remain an
obligation. The latch now runs after every bars ingest
(`packages/db/src/review-triggers.ts`, called by the worker), the only time a
condition's inputs change. The Briefing page and the REST agent API's default
reads still latch as before.

### Output schemas

Every tool declares an `outputSchema` (`lib/mcp/outputs.ts`), advertised in
`tools/list` in both protocol eras. They describe each top-level field the
model should rely on, with the real coarse type and a description. They are
permissive by construction: every field is optional, because the agent API
drops nulls, and every object is open, because a response gaining a field must
not break a client.

The SDK validates *after* the handler runs, so a schema stricter than the API
would turn a write that landed into an error. `outputs.test.ts` proves each
schema accepts a realistic result, an empty one and unknown fields, while
still rejecting a wrong type. All 22 tools were also run against real data on
a local database with no validation failure.

### Errors

Every tool error is `isError: true` with `structuredContent.error`:

| Field | Meaning |
|-------|---------|
| `source` | `powerfund_api` (PowerFund refused or failed), `mcp` (the adapter), `authorization` (scope) |
| `code` | The agent API code (`UNKNOWN_SYMBOL`, `DOSSIER_VERSION_CONFLICT`, …) or `VALIDATION_ERROR`, `TIMEOUT`, `INSUFFICIENT_SCOPE`, `WRITES_DISABLED` (read-only deployment), `IDEMPOTENCY_IN_PROGRESS` (retry shortly), `MCP_INTERNAL_ERROR` |
| `retryable` | Whether an identical retry could succeed |
| `http_status` | For `powerfund_api` errors |
| extra | Only fields that help correct the call: `current_version`, `allowed`, `field(s)`, `symbol`, `required_scopes` |

A 5xx from PowerFund keeps its code and loses its text, because the text can be
a raw database error. Invalid arguments are rejected by the SDK before any
PowerFund call, with the failing path named. An `INSUFFICIENT_SCOPE` result also
carries `_meta["mcp/www_authenticate"]`, which is how ChatGPT knows to offer a
reconnect with more scope.

## Catalog

<!-- BEGIN GENERATED TOOL CATALOG -->

| Tool | Kind | Scopes | Backing REST operations |
|---|---|---|---|
| `get_fund_state` | Read | `powerfund:state:read` | getFundState |
| `get_portfolio` | Read | `powerfund:portfolio:read` | getPortfolio |
| `get_performance` | Read | `powerfund:portfolio:read` | getPerformance |
| `get_research_inbox` | Read | `powerfund:dossier:read` | getResearchInbox |
| `get_review_context` | Read | `powerfund:dossier:read` `powerfund:journal:read` `powerfund:reviews:read` `powerfund:deployment:read` | getCompanyDossier, getJournal, getReviewQueue, getPlannedActions |
| `get_dossier` | Read | `powerfund:dossier:read` | getCompanyDossier |
| `list_dossier_versions` | Read | `powerfund:dossier:read` | getDossierVersions |
| `get_dossier_version` | Read | `powerfund:dossier:read` | getDossierVersion |
| `get_journal` | Read | `powerfund:journal:read` | getJournal |
| `get_calibration_status` | Read | `powerfund:journal:read` | getCalibrationStatus |
| `list_planned_actions` | Read | `powerfund:deployment:read` | getPlannedActions |
| `list_reviews` | Read | `powerfund:reviews:read` | getReviewQueue |
| `update_dossier` | Write — modifies or withdraws | `powerfund:dossier:write` | updateDossier |
| `record_decision` | Write — append | `powerfund:journal:append` | createDecision |
| `record_decision_outcome` | Write — append | `powerfund:journal:append` | recordDecisionOutcome |
| `create_planned_action` | Write — append | `powerfund:deployment:write` | createPlannedAction |
| `update_planned_action` | Write — modifies or withdraws | `powerfund:deployment:write` | updatePlannedAction |
| `create_review_task` | Write — append | `powerfund:reviews:write` | createReviewTask |
| `update_review_task` | Write — modifies or withdraws | `powerfund:reviews:write` | updateReviewTask |
| `complete_review_task` | Write — modifies or withdraws | `powerfund:reviews:write` | completeReviewTask |
| `add_watchlist_company` | Write — append | `powerfund:watchlist:write` | addWatchlistCompany |
| `set_watchlist_archived` | Write — modifies or withdraws | `powerfund:watchlist:write` | setWatchlistArchived |

### `get_fund_state` — Get fund state and what is due

Start here for the daily briefing sweep and for 'what is due today?'. Returns the mandate and capital phase, cash, holdings, flags (including the kill-switch diagnostic), the open deployment queue, due and upcoming review tasks, recent decisions and current dossier version pointers, plus the watchlist and themes unless include_watchlist is false. Use get_portfolio for position-level marks and get_performance for returns.

| | |
|---|---|
| Kind | Read |
| Annotations | readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=false |
| Scopes (all required) | `powerfund:state:read` |
| Backing REST | `getFundState` (`GET /api/v1/agent/state`) |

| Argument | Type | Required | Notes |
|---|---|---|---|
| `recent_decisions` | integer (1–50) |  | How many recent journal rows to include. Default 20. |
| `include_watchlist` | boolean |  | Include the research universe and themes. Default true; set false for a smaller snapshot. |

### `get_portfolio` — Get the portfolio book

Use when judging exposure, position size, weights, cash or cap headroom, or before proposing an allocation. Returns the ledger-derived book: NAV, cash, invested cost against the capital-phase cap, each position's quantity, cost, last close and last_close_session, and mandate flags. Check price_data_through before treating marks as current. Returns are not here; use get_performance.

| | |
|---|---|
| Kind | Read |
| Annotations | readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=false |
| Scopes (all required) | `powerfund:portfolio:read` |
| Backing REST | `getPortfolio` (`GET /api/v1/agent/portfolio`) |

No arguments.

### `get_performance` — Get performance vs SPY and QQQ

Use for the scoreboard: NAV and deployed-capital time-weighted returns against SPY and QQQ, current and maximum unitized drawdowns, and dollar contribution by ticker, theme and factor. Returns are percent; pnl_usd is dollars. Optional from/to window. Per-decision returns are on get_journal instead.

| | |
|---|---|
| Kind | Read |
| Annotations | readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=false |
| Scopes (all required) | `powerfund:portfolio:read` |
| Backing REST | `getPerformance` (`GET /api/v1/agent/performance`) |

| Argument | Type | Required | Notes |
|---|---|---|---|
| `from` | string (YYYY-MM-DD) |  | Inclusive start, YYYY-MM-DD. Omit for since inception. |
| `to` | string (YYYY-MM-DD) |  | Inclusive end, YYYY-MM-DD. Omit to include today's mark. |

### `get_research_inbox` — Get the research inbox

Use for 'what is in the research inbox?' and watchlist hygiene. Returns the Briefing Research tab exactly as the UI derives it: names needing a first dossier, dossiers past their next_review_at, and dossiers whose 14-day diligence clock has lapsed. This is a backlog, not the daily sweep. An item clears only when update_dossier moves the clock that kind uses.

| | |
|---|---|
| Kind | Read |
| Annotations | readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=false |
| Scopes (all required) | `powerfund:dossier:read` |
| Backing REST | `getResearchInbox` (`GET /api/v1/agent/research`) |

| Argument | Type | Required | Notes |
|---|---|---|---|
| `kinds` | "needs_dossier" \| "review_due_date" \| "diligence"[] |  | Restrict to these kinds. Omit for all. |

### `get_review_context` — Load the prior-beliefs pack for a review

Use FIRST when re-underwriting a name, reassessing a trigger or planned add, running a weekly holding review, asking what conditions remain before allocating, or completing any company/theme review. Loads all three memories in one call: the live dossier and recent journal for the symbol, completed reviews linked to the symbol or theme, the book-level portfolio review chain (which symbol filters can never reach), open reviews on the name, and open planned actions for it. Read-only. State previous belief → new evidence → updated belief before writing anything.

| | |
|---|---|
| Kind | Read |
| Annotations | readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=false |
| Scopes (all required) | `powerfund:dossier:read`, `powerfund:journal:read`, `powerfund:reviews:read`, `powerfund:deployment:read` |
| Backing REST | `getCompanyDossier` (`GET /api/v1/agent/companies/{symbol}`)<br>`getJournal` (`GET /api/v1/agent/journal`)<br>`getReviewQueue` (`GET /api/v1/agent/review-queue`)<br>`getPlannedActions` (`GET /api/v1/agent/deployment-queue`) |

| Argument | Type | Required | Notes |
|---|---|---|---|
| `symbol` | string |  | Ticker to load. Give symbol, theme, or both. |
| `theme` | string |  | Theme slug or name, for a theme review. |
| `history_limit` | integer (1–20) |  | Completed reviews to load per chain. Default 5. |
| `journal_limit` | integer (1–50) |  | Journal entries for the symbol. Default 10. |

### `get_dossier` — Get a company dossier

Use when asked for a company's dossier, thesis, kill criteria or research status, and before any update_dossier (you need current_version for expected_version). Returns instrument metadata, the live dossier, its current version number, and last_close with last_close_session; price_data_stale means the last completed US session is missing. For a full re-underwrite or reassessment, prefer get_review_context, which includes this.

| | |
|---|---|
| Kind | Read |
| Annotations | readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=false |
| Scopes (all required) | `powerfund:dossier:read` |
| Backing REST | `getCompanyDossier` (`GET /api/v1/agent/companies/{symbol}`) |

| Argument | Type | Required | Notes |
|---|---|---|---|
| `symbol` | string | yes | Ticker exactly as PowerFund stores it, e.g. SNDK or MRCY. |

### `list_dossier_versions` — List dossier versions

Use to see how a thesis has changed over time: returns immutable version headers (number, change_reason, created_at) without bodies. Then fetch the versions you need with get_dossier_version and compare them yourself; there is no diff.

| | |
|---|---|
| Kind | Read |
| Annotations | readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=false |
| Scopes (all required) | `powerfund:dossier:read` |
| Backing REST | `getDossierVersions` (`GET /api/v1/agent/companies/{symbol}/versions`) |

| Argument | Type | Required | Notes |
|---|---|---|---|
| `symbol` | string | yes | Ticker exactly as PowerFund stores it, e.g. SNDK or MRCY. |

### `get_dossier_version` — Get one dossier version

Use to answer 'what did we believe when we made that decision?': returns the dossier exactly as it stood at one version. Pass the version number, or the dossier_version.id pinned on a journal entry. Never use the live dossier as a stand-in for a past belief.

| | |
|---|---|
| Kind | Read |
| Annotations | readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=false |
| Scopes (all required) | `powerfund:dossier:read` |
| Backing REST | `getDossierVersion` (`GET /api/v1/agent/companies/{symbol}/versions/{version}`) |

| Argument | Type | Required | Notes |
|---|---|---|---|
| `symbol` | string | yes | Ticker exactly as PowerFund stores it, e.g. SNDK or MRCY. |
| `version` | integer (≥ 1) \| string | yes | Version number such as 3, or a dossier_version UUID from a journal entry. |

### `get_journal` — Read the decision journal

Use for 'what did we decide about X and why?', last week's hold before a weekly holding review, and the grading worklist (horizon_due=true). Each entry has the pinned dossier_version, 30/90/180-day returns vs SPY from its anchor, and any recorded outcomes. An entry's id is its decision_id; the pinned dossier_version.id is a different id.

| | |
|---|---|
| Kind | Read |
| Annotations | readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=false |
| Scopes (all required) | `powerfund:journal:read` |
| Backing REST | `getJournal` (`GET /api/v1/agent/journal`) |

| Argument | Type | Required | Notes |
|---|---|---|---|
| `symbol` | string |  | Ticker exactly as PowerFund stores it, e.g. SNDK or MRCY. |
| `decision_type` | "enter" \| "add" \| "reduce" \| "exit" \| "hold" \| "watch" \| "material" |  | Filter to one type. 'material' means enter, add, reduce and exit. |
| `date_from` | string |  | Inclusive lower bound on action_at. |
| `date_to` | string |  | Inclusive upper bound on action_at. |
| `before` | string |  | Page backwards: rows older than this action_at. |
| `limit` | integer (1–100) |  | Page size. Default 50. |
| `graded` | boolean |  | false: never graded at all. Not the grading worklist; use horizon_due for that. |
| `horizon_due` | boolean |  | true: decisions with an elapsed 30/90/180-day horizon still owed a grade. |

### `get_calibration_status` — Get the decision-grading worklist

Use to scope and then reconcile a grading run (ritual 12): the whole worklist of decisions owed a 30/90/180-day grade, split by decision class, what has already been recorded, and which decisions can never be graded (no_fill). Read it again after a batch of record_decision_outcome calls to confirm every grade landed on the intended decision.

| | |
|---|---|
| Kind | Read |
| Annotations | readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=false |
| Scopes (all required) | `powerfund:journal:read` |
| Backing REST | `getCalibrationStatus` (`GET /api/v1/agent/calibration`) |

No arguments.

### `list_planned_actions` — List the deployment queue

Use to see intended trades — pending and deferred buy/add/reduce/sell — and to find a planned_action_id before update_planned_action. These are intentions, not executions: a human books every fill in the PowerFund UI.

| | |
|---|---|
| Kind | Read |
| Annotations | readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=false |
| Scopes (all required) | `powerfund:deployment:read` |
| Backing REST | `getPlannedActions` (`GET /api/v1/agent/deployment-queue`) |

No arguments.

### `list_reviews` — List review tasks and review history

The catalyst calendar and the book's review record. Open statuses are the work queue (use status ['due'] for what is due now); status ['completed'] is what the book concluded — the prior beliefs to load before a comparable review. symbols matches any review linked to the name but never reaches scope=portfolio reviews; ask for scope 'portfolio' separately. symbols and themes together are a union. If truncated is true, raise limit or narrow the window.

| | |
|---|---|
| Kind | Read |
| Annotations | readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=false |
| Scopes (all required) | `powerfund:reviews:read` |
| Backing REST | `getReviewQueue` (`GET /api/v1/agent/review-queue`) |

| Argument | Type | Required | Notes |
|---|---|---|---|
| `status` | "open" \| "all" \| "pending" \| "due" \| "in_progress" \| "completed" \| "deferred" \| "cancelled"[] |  | Default ['open']. |
| `scope` | "company" \| "theme" \| "macro" \| "portfolio" |  |  |
| `symbols` | string[] |  |  |
| `themes` | string[] |  | Theme slugs or names, e.g. ai-infrastructure. |
| `completed_since` | string |  | ISO date or date-time on completed_at. A bare date is the start of that UTC day. |
| `completed_before` | string |  |  |
| `limit` | integer (1–500) |  | Default 100. |
| `order` | "asc" \| "desc" |  | Defaults to newest first for completed-only queries, oldest first otherwise. |

### `update_dossier` — Update a company dossier

Write research to the live dossier after the user approves the change: a re-underwrite, a first dossier (version 1) for a new name, refreshed scenarios, or advancing next_review_at. Call get_dossier first and pass its current version as expected_version; a stale version is refused rather than overwriting newer work. A new immutable version is created only if the content actually changed. Every earlier version is kept.

| | |
|---|---|
| Kind | Write — modifies or withdraws |
| Annotations | readOnlyHint=false, destructiveHint=true, idempotentHint=true, openWorldHint=false |
| Scopes (all required) | `powerfund:dossier:write` |
| Backing REST | `updateDossier` (`PATCH /api/v1/agent/companies/{symbol}/dossier`) |

| Argument | Type | Required | Notes |
|---|---|---|---|
| `symbol` | string | yes | Ticker exactly as PowerFund stores it, e.g. SNDK or MRCY. |
| `expected_version` | integer (≥ 0) \| null | yes | current_version.number from get_dossier (0 if the dossier exists with no version). null only when get_dossier returned no dossier at all — a first write, which also needs changes.summary. |
| `change_reason` | string | yes | Why this write is happening, e.g. 'Q3 print re-underwrite'. |
| `changes` | { status?, research_level?, summary?, thesis?, catalysts?, risks?, invalidation?, competitive_notes?, next_diligence?, source?, as_of_at?, verified_at?, next_review_at? } | yes | Only the fields you are changing. Omit unchanged fields. |
| `research_sources` | string[] |  | URLs or citations used. |
| `actor_name` | string |  | The name you go by. The server stamps it on the row as attribution. Never write an [agent:…] tag into any text field yourself. |

### `record_decision` — Record a journal decision

Append a decision to the journal after the user approves it: this week's hold (which is what completes a weekly holding review), or an enter/add/reduce/exit/watch conclusion. The current dossier version is pinned automatically. This records a judgement; it does not trade. Journal rows are never edited — a new conclusion is a new row. One name per call.

| | |
|---|---|
| Kind | Write — append |
| Annotations | readOnlyHint=false, destructiveHint=false, idempotentHint=false, openWorldHint=false |
| Scopes (all required) | `powerfund:journal:append` |
| Backing REST | `createDecision` (`POST /api/v1/agent/decisions`) |

| Argument | Type | Required | Notes |
|---|---|---|---|
| `symbol` | string | yes | Ticker exactly as PowerFund stores it, e.g. SNDK or MRCY. |
| `decision_type` | "enter" \| "add" \| "reduce" \| "exit" \| "hold" \| "watch" | yes |  |
| `thesis` | string | yes | The conclusion and why. |
| `catalysts` | string |  |  |
| `risks` | string |  |  |
| `invalidation` | string |  | Kill criteria as they stand now. |
| `sizing_rationale` | string |  |  |
| `action_at` | string |  | When the decision was made. Default now. |
| `actor_name` | string |  | The name you go by. The server stamps it on the row as attribution. Never write an [agent:…] tag into any text field yourself. |

### `record_decision_outcome` — Grade a past decision

Append a structured grade to a journal decision (ritual 12, or an off-clock observation on exit) once the user has approved the grade or the batch. decision_id is the journal entry's id — not its dossier_version.id. horizon_days is required: 30, 90 or 180 for a clocked grade, null for an off-clock note. Grade on evidence available at the horizon cutoff, not today. Grades are append-only and one per decision per horizon.

| | |
|---|---|
| Kind | Write — append |
| Annotations | readOnlyHint=false, destructiveHint=false, idempotentHint=false, openWorldHint=false |
| Scopes (all required) | `powerfund:journal:append` |
| Backing REST | `recordDecisionOutcome` (`POST /api/v1/agent/decisions/{id}/outcome`) |

| Argument | Type | Required | Notes |
|---|---|---|---|
| `decision_id` | string (uuid) | yes | Journal decision (the entry's id) UUID, copied from an earlier PowerFund result. Never guess it. |
| `horizon_days` | 30 \| 90 \| 180 \| null | yes | 30, 90 or 180 for a clocked grade; null for an off-clock observation. |
| `thesis_grade` | "correct" \| "partly_correct" \| "wrong" | yes |  |
| `timing_grade` | "good" \| "mixed" \| "poor" |  |  |
| `sizing_grade` | "good" \| "mixed" \| "poor" |  |  |
| `risk_management_grade` | "good" \| "mixed" \| "poor" |  |  |
| `lessons` | string | yes | Behaviour to repeat or change. Not a P&L restatement. |
| `actor_name` | string |  | The name you go by. The server stamps it on the row as attribution. Never write an [agent:…] tag into any text field yourself. |

### `create_planned_action` — Queue an intended trade

Queue an intended buy/add/reduce/sell after the user approves it and, for buy or add, after the dossier/data-integrity gate has passed. Send exactly one of planned_usd or target_weight_pct. This is an intention on the deployment queue only: it never books a fill, and the mandate gate may still refuse it. A human confirms every fill in the PowerFund UI.

| | |
|---|---|
| Kind | Write — append |
| Annotations | readOnlyHint=false, destructiveHint=false, idempotentHint=false, openWorldHint=false |
| Scopes (all required) | `powerfund:deployment:write` |
| Backing REST | `createPlannedAction` (`POST /api/v1/agent/planned-actions`) |

| Argument | Type | Required | Notes |
|---|---|---|---|
| `symbol` | string | yes | Ticker exactly as PowerFund stores it, e.g. SNDK or MRCY. |
| `action_type` | "buy" \| "add" \| "reduce" \| "sell" | yes | buy for a first entry, add for a later tranche. |
| `planned_usd` | number |  | Dollar size. |
| `target_weight_pct` | number (–100) |  | Alternative to planned_usd; converted using current NAV. |
| `window_label` | string |  | Entry condition, e.g. price_below:290. |
| `due_by` | string (YYYY-MM-DD) |  | Calendar date, YYYY-MM-DD. |
| `rationale` | string | yes | Why, in plain text. No [agent:…] tag. |
| `actor_name` | string |  | The name you go by. The server stamps it on the row as attribution. Never write an [agent:…] tag into any text field yourself. |

### `update_planned_action` — Revise, defer or cancel an intended trade

Change an open planned action after the user approves it: defer it when the window no longer holds, cancel it when the thesis is done, or revise its size, window, due date or rationale. Get the id from list_planned_actions or get_review_context. It cannot confirm or book a fill.

| | |
|---|---|
| Kind | Write — modifies or withdraws |
| Annotations | readOnlyHint=false, destructiveHint=true, idempotentHint=true, openWorldHint=false |
| Scopes (all required) | `powerfund:deployment:write` |
| Backing REST | `updatePlannedAction` (`PATCH /api/v1/agent/planned-actions/{id}`) |

| Argument | Type | Required | Notes |
|---|---|---|---|
| `planned_action_id` | string (uuid) | yes | Planned action UUID, copied from an earlier PowerFund result. Never guess it. |
| `status` | "pending" \| "deferred" \| "cancelled" |  |  |
| `action_type` | "buy" \| "add" \| "reduce" \| "sell" |  |  |
| `planned_usd` | number |  |  |
| `target_weight_pct` | number (–100) |  |  |
| `window_label` | string |  |  |
| `due_by` | string (YYYY-MM-DD) |  | Calendar date, YYYY-MM-DD. |
| `rationale` | string |  | Reason for the change. No [agent:…] tag. |
| `actor_name` | string |  | The name you go by. The server stamps it on the row as attribution. Never write an [agent:…] tag into any text field yourself. |

### `create_review_task` — Add a dated review to the calendar

After the user approves it, add a dated, actionable obligation to the catalyst calendar: an earnings print, event window, policy decision or price condition (scope company/theme/macro), or a book-level ritual such as 'Monthly book pass — YYYY-MM' (scope portfolio, no symbols). Check list_reviews for an existing task first and update it instead of duplicating. Not for weekly holds (use record_decision) and never a trade.

| | |
|---|---|
| Kind | Write — append |
| Annotations | readOnlyHint=false, destructiveHint=false, idempotentHint=false, openWorldHint=false |
| Scopes (all required) | `powerfund:reviews:write` |
| Backing REST | `createReviewTask` (`POST /api/v1/agent/review-tasks`) |

| Argument | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes |  |
| `instructions` | string | yes | The checklist for the day it comes due. Say whether the date is confirmed or estimated. |
| `scope` | "company" \| "theme" \| "macro" \| "portfolio" | yes | company needs symbols; theme needs existing theme slugs; portfolio carries none. |
| `priority` | "low" \| "normal" \| "high" \| "urgent" |  |  |
| `symbols` | string[] |  |  |
| `themes` | string[] |  |  |
| `trigger` | { type: "scheduled", at } \| { type: "event_window", not_before, due_by } \| { type: "condition", metric, symbol, operator, value, lookback_days? } | yes | scheduled = confirmed date; event_window = estimated date (use this for third-party or inferred dates); condition = price level or return. A trigger never creates a trade. |

### `update_review_task` — Update a review on the calendar

After the user approves it, change an open review task: thicken its instructions, promote an estimated event_window to a confirmed scheduled date, relink symbols/themes, or set status to in_progress, deferred or cancelled. Cannot mark a task due or completed — triggers mark due, and complete_review_task finishes it.

| | |
|---|---|
| Kind | Write — modifies or withdraws |
| Annotations | readOnlyHint=false, destructiveHint=true, idempotentHint=true, openWorldHint=false |
| Scopes (all required) | `powerfund:reviews:write` |
| Backing REST | `updateReviewTask` (`PATCH /api/v1/agent/review-tasks/{id}`) |

| Argument | Type | Required | Notes |
|---|---|---|---|
| `review_task_id` | string (uuid) | yes | Review task UUID, copied from an earlier PowerFund result. Never guess it. |
| `title` | string |  |  |
| `instructions` | string |  |  |
| `scope` | "company" \| "theme" \| "macro" \| "portfolio" |  |  |
| `priority` | "low" \| "normal" \| "high" \| "urgent" |  |  |
| `status` | "pending" \| "in_progress" \| "deferred" \| "cancelled" |  |  |
| `symbols` | string[] |  |  |
| `themes` | string[] |  |  |
| `trigger` | { type: "scheduled", at } \| { type: "event_window", not_before, due_by } \| { type: "condition", metric, symbol, operator, value, lookback_days? } |  | scheduled = confirmed date; event_window = estimated date (use this for third-party or inferred dates); condition = price level or return. A trigger never creates a trade. |

### `complete_review_task` — Record a review's outcome

After the user approves the conclusion, close a review task with its written outcome: cite the prior beliefs you loaded and whether they held, and link any dossier_version, decision or planned_action ids you created for it. Creates none of those itself. For a monthly or quarterly book review, create the next period's task afterwards unless one is already open.

| | |
|---|---|
| Kind | Write — modifies or withdraws |
| Annotations | readOnlyHint=false, destructiveHint=true, idempotentHint=false, openWorldHint=false |
| Scopes (all required) | `powerfund:reviews:write` |
| Backing REST | `completeReviewTask` (`POST /api/v1/agent/review-tasks/{id}/complete`) |

| Argument | Type | Required | Notes |
|---|---|---|---|
| `review_task_id` | string (uuid) | yes | Review task UUID, copied from an earlier PowerFund result. Never guess it. |
| `outcome` | string | yes | What the review concluded: previous belief → new evidence → updated belief. |
| `outputs` | { kind, entity_id }[] |  |  |

### `add_watchlist_company` — Add a company to the research universe

After the user approves it, add a new ticker to the watchlist under an existing theme (ai-infrastructure, energy, robotics-ai, defence, other). Check get_fund_state's watchlist first; a duplicate is refused. It creates no dossier, planned trade or fill — write the first dossier with update_dossier.

| | |
|---|---|
| Kind | Write — append |
| Annotations | readOnlyHint=false, destructiveHint=false, idempotentHint=false, openWorldHint=false |
| Scopes (all required) | `powerfund:watchlist:write` |
| Backing REST | `addWatchlistCompany` (`POST /api/v1/agent/watchlist`) |

| Argument | Type | Required | Notes |
|---|---|---|---|
| `symbol` | string | yes | Ticker exactly as PowerFund stores it, e.g. SNDK or MRCY. |
| `name` | string | yes | Company name. |
| `theme` | string | yes | Existing theme slug or name. |
| `notes` | string |  |  |
| `asset_class` | "equity" \| "etf" \| "commodity_proxy" \| "other" |  | Default equity. |
| `exchange` | string |  | Listing venue. Default US; non-USD listings cannot be booked. |
| `actor_name` | string |  | The name you go by. The server stamps it on the row as attribution. Never write an [agent:…] tag into any text field yourself. |

### `set_watchlist_archived` — Archive or restore a watchlist name

Only when the user explicitly asks to drop a name from the opportunity set (archived true) or bring one back (archived false). Refused while a position is open. Watchlist and active status follow the book and cannot be set.

| | |
|---|---|
| Kind | Write — modifies or withdraws |
| Annotations | readOnlyHint=false, destructiveHint=true, idempotentHint=true, openWorldHint=false |
| Scopes (all required) | `powerfund:watchlist:write` |
| Backing REST | `setWatchlistArchived` (`PATCH /api/v1/agent/watchlist/{symbol}`) |

| Argument | Type | Required | Notes |
|---|---|---|---|
| `symbol` | string | yes | Ticker exactly as PowerFund stores it, e.g. SNDK or MRCY. |
| `archived` | boolean | yes |  |

<!-- END GENERATED TOOL CATALOG -->
