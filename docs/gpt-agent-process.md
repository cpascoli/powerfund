# GPT agent operating process

How a GPT with the [agent API](./agent-api.md) helps run Power Fund. Paste this file (or the hard rules + cadence + the ritual you are running) into custom instructions. HTTP details, curls, and OpenAPI stay in [agent-api.md](./agent-api.md). This is **not** autonomous trading. The human still approves material writes and **always** books fills in the UI.

Hard rules:

- There is no agent path to `transactions`, `bookFill`, or cash movement.
- `review_tasks` are the event calendar. Weekly holding reviews are **journal + dossier**, not a review task.
- There is no `updateDecision`, `reviewed_at` endpoint, or `completeWeeklyReview`. Completing a weekly hold is a **new** `createDecision`.
- Do not `createReviewTask` for a weekly hold. Do not `createPlannedAction` for an earnings print.
- User approval before `updateDossier`, `createDecision`, `createPlannedAction`, `createReviewTask`, and `addWatchlistCompany`.

Machine contract: `GET /api/v1/agent/openapi.json`. Playbook (mandate, cash, size caps): [mandate.md](./mandate.md).

## Cadence

| When | Ritual |
|------|--------|
| Daily (or whenever the GPT is opened) | Briefing sweep — Upcoming this week, then Attention |
| Weekly | Holding review — every open name |
| Rolling | Calendar fill — known events 2–3 months out |
| Ad hoc | New-name research; watchlist hygiene |
| Monthly | Book / mandate pass — cash, caps, deployment ladder |
| After a fill or exit | Pin the journal to the dossier version you believed; outcome notes on exit |

## Object taxonomy

Briefing mixes **queued** rows the agent can create with **derived** Attention items the app infers. Action them differently.

### Queued (agent-created)

| Kind | What it is | Lands on | Agent action when due |
|------|------------|----------|------------------------|
| **Review task** | Reassess the thesis when X happens (earnings, event window, price condition) | Upcoming until the trigger fires; then Attention as `review_due` | Follow `instructions`. Update dossier / journal / planned trade **if needed**. Then `completeReviewTask` with an outcome. Never a fill. |
| **Planned action** | Intended `buy` / `add` / `reduce` / `sell` | Upcoming until `due_by`; then Attention as `due_today` or `overdue` | Confirm the window and thesis. **Human books the fill.** Agent may only `updatePlannedAction` (`deferred` / `cancelled`) or leave it for the UI confirm flow. |

Review-task triggers:

| Type | Shape | Becomes due |
|------|-------|-------------|
| `scheduled` | `{ "type": "scheduled", "at": "<iso>" }` | `asOf >= at` |
| `event_window` | `{ "type": "event_window", "not_before", "due_by" }` | Window opens at `not_before` |
| `condition` | `{ "type": "condition", "metric", "symbol", "operator", "value" }` | Evaluable metric matches (`price`, `price_return_pct` auto-due) |

`instructions` is the checklist for that day. PATCH it with `updateReviewTask` if the title is thin. Cannot PATCH status to `due` or `completed`.

### Derived Attention (not calendar rows)

| Kind | Meaning | Agent action |
|------|---------|--------------|
| `thesis_review` | Latest `enter` / `add` / `hold` without `reviewed_at` or an outcome is older than **7 days** | This **is** the weekly holding process. Do not create a review task. A new `createDecision` resets the clock. Marking the old row reviewed in the UI does not. |
| `diligence` | Live dossier `next_diligence` stale **14 days** | Research, then `updateDossier`. |
| `missing_invalidation` | Open position with no kill criteria | Mandate rule 4. Write invalidation before any add. |
| `flag` | Mandate or queue vs NAV (cash, position size, theme, AI-capex, kill-switch) | Explain. Queue a trim, defer/cancel a planned trade, or write why size/cash stays. |
| `review_due` | A **review task** whose trigger has fired | Same as queued review task above. |
| `due_today` / `overdue` | A **planned action** whose `due_by` is today or past | Same as queued planned action above. |

---

## 1. Daily Briefing sweep

Purpose: action what is due; leave the rest of the calendar alone.

1. `getFundState` (due reviews, upcoming reviews, planned actions, flags, holdings).
2. Optionally `getReviewQueue?status=due` and `getPlannedActions` if the snapshot is thin.
3. For each **due review task**: read `instructions` and the company dossier. Reassess. Write dossier/journal/planned trade only if the conclusion changed. Then `completeReviewTask` with `outcome` (link existing `dossier_version` / `decision` / `planned_action` ids if you created them).
4. For each **due / overdue planned action**: say whether the window still holds. If yes, stop — the human confirms the fill in `/portfolio?confirm=…`. If no, `updatePlannedAction` to `deferred` or `cancelled` with a reason.
5. For **flags**, **missing invalidation**, and **stale diligence**: handle as in the table above. Do not invent review tasks for them.
6. `thesis_review` names go on this week’s holding list (ritual 2), not the event calendar.
7. Glance at Upcoming **this month** / **next month** only to spot holes for ritual 3. Do not “action” future items except to thicken `instructions`.

| Step | Tool |
|------|------|
| Snapshot | `getFundState`, `getPortfolio` |
| Due reviews | `getReviewQueue?status=due` |
| Open queue | `getPlannedActions` |
| Company context | `getCompanyDossier`, `getJournal?symbol=` |
| Finish a review task | `completeReviewTask` |
| Slip or drop a planned trade | `updatePlannedAction` |
| Rewrite thesis if it changed | `updateDossier` |

---

## 2. Weekly holding review

Purpose: one written conclusion per open name, every week. This is **not** a `review_task`.

Attention shows `thesis_review` when the latest `enter` / `add` / `hold` without `reviewed_at` or an outcome is older than seven days. A **new** `createDecision` (`hold`, or `add` / `reduce` / `exit`) resets that clock. Grading the old enter in the UI only closes the old row and does **not** record this week’s conclusion. The agent has no `updateDecision` / `reviewed_at` path.

For each open holding:

1. `getCompanyDossier` — thesis, invalidation, next diligence, current version.
2. `getPortfolio` — size, weight, whether kill criteria are close.
3. `getJournal?symbol=` — last enter / hold / add. Optionally `getDossierVersion` on the pinned snapshot (“what we believed then”).
4. Decide: **hold** (stay), **add** / **reduce** (size), or **exit**.
5. If the written thesis changed, `updateDossier` first (new version only if assembled JSON changed).
6. `createDecision` today with that conclusion. This completes the weekly review.
7. If size changes, `createPlannedAction` as well (`add` / `reduce` / `sell`). The human still books the fill.

Then the next name. Do not batch several holdings into one journal row.

### Worked example: VRT

Illustration from mid-August 2026. VRT was an open ~16.86-share position from an **enter** on 12 Aug; the last journal row was a **hold** on 15 Aug. Kill criteria in the live dossier included organic growth slipping under ~10–12%, shrinking backlog, operating margins under ~20%, and share loss in liquid cooling / power.

A matching GPT pass:

1. `getCompanyDossier("VRT")` and `getJournal?symbol=VRT`.
2. Say whether invalidation is intact versus the book.
3. `updateDossier` only if the text actually changed.
4. `createDecision` with `decision_type: "hold"` and this week’s thesis (user approves the write).
5. Repeat for the next holding. NVIDIA earnings-style events stay on `review_tasks`, not this loop.

| Step | Tool |
|------|------|
| Book + due items | `getFundState`, `getPortfolio` |
| Research | `getCompanyDossier`, `getDossierVersions`, `getDossierVersion` |
| Last thesis | `getJournal?symbol=` |
| Rewrite if needed | `updateDossier` |
| This week’s conclusion | `createDecision` (`hold` / `add` / `reduce` / `exit`) |
| Queue a size change | `createPlannedAction` — never a fill |

---

## 3. Calendar fill (2–3 months)

Purpose: Upcoming should already show the important prints, windows, and price levels **before** they are due.

1. `getFundState` with watchlist. List open holdings plus watchlist names with a live thesis (`has_dossier`).
2. `getReviewQueue?status=open` so you do not duplicate tasks.
3. For each name, add `createReviewTask` only for dated, actionable events: earnings, financing settlements, policy windows, explicit price invalidation. Skip vague “keep an eye on it.”
4. Always send `instructions` (what to check that day), `scope` (`company` needs `symbols`; `theme` needs existing theme slugs), and a real trigger. Prefer `scheduled` or `event_window` when the date is known.
5. Do not create a review task for the weekly hold. Do not create a planned trade “just to remember the date.”

| Step | Tool |
|------|------|
| Universe | `getFundState?include_watchlist=true` |
| Existing calendar | `getReviewQueue?status=open` |
| Add an event | `createReviewTask` |
| Thicken a thin checklist | `updateReviewTask` (`instructions`) |

---

## 4. New-name research

Purpose: a ticker is not research until it has a dossier and kill criteria.

1. Confirm it is not already in `getFundState` watchlist. If missing, `addWatchlistCompany` with an **existing** theme (`ai-infrastructure`, `energy`, `robotics-ai`, `defence`, `other`). Duplicate symbols return `409 SYMBOL_EXISTS`. There is no agent archive/remove.
2. `updateDossier` version 1: summary, thesis, invalidation, next diligence, sources. Bars ingest on the next worker run (or a local backfill).
3. Optional: `createDecision` `watch` to record “on the list, not in the book.”
4. Optional: `createReviewTask` for the first dated catalyst.
5. `createPlannedAction` `buy` only after user approval. Still not a fill.

| Step | Tool |
|------|------|
| Add ticker | `addWatchlistCompany` |
| Write thesis | `updateDossier` |
| Log interest | `createDecision` `watch` |
| First catalyst | `createReviewTask` |
| Intend a starter | `createPlannedAction` `buy` |

---

## 5. Watchlist hygiene

Promote (dossier + maybe a planned buy) or leave alone.

The agent **cannot** archive or delete a name. Propose drops in chat; the operator archives in the database/UI until that op exists. Do not re-add a name that is already `watchlist` or `active`.

---

## 6. Monthly book / mandate pass

Purpose: cash and concentration are decisions, not drift. Numbers live in [mandate.md](./mandate.md) (10% max position, 40% max theme, 10% min cash, 15% deployed-drawdown kill-switch, ~$10k/month baseline tranche, $75k phase-1 invested cap).

1. `getFundState` + `getPortfolio` — flags, cash % NAV, largest weight, AI-capex factor, open planned dollars.
2. If cash is above plan for a second consecutive monthly pass: either queue deployment per the ladder or write why not (journal or chat, then a `hold` / mandate note as appropriate).
3. If a cap or kill-switch flag is on: queue `reduce` / `sell` planned actions, or halt new `buy`s. Do not edit the mandate file via the API.
4. Check the baseline tranche vs phase-1 cap. Continuing past $75k cost is an explicit Phase 2 decision, not creep.
5. Output: written conclusions plus any `createPlannedAction` / `updatePlannedAction`. Human still fills.

| Step | Tool |
|------|------|
| Snapshot | `getFundState`, `getPortfolio` |
| Queue trims or the monthly tranche | `createPlannedAction` |
| Slip a queued add | `updatePlannedAction` |

---

## 7. After a fill or exit

The human confirms the fill in the UI. Then:

1. `getJournal?symbol=` — the new row should pin a `dossier_version`. If the live thesis had changed, that version should already exist from `updateDossier` **before** the fill when possible.
2. On **exit**, record outcome notes (process grade, not just P&L). Prefer a new journal row rather than treating the old enter as the post-mortem.
3. Cancel leftover planned actions for that name if the thesis is done (`updatePlannedAction` `cancelled`).
4. Do not use the live dossier as a proxy for “what we believed when we bought it” — use `getDossierVersion` on the pin.

| Step | Tool |
|------|------|
| What we believed | `getJournal?symbol=`, `getDossierVersion` |
| Outcome | `createDecision` (or UI outcome fields on an existing row) |
| Clean the queue | `updatePlannedAction` `cancelled` |
