# REST operation → MCP tool

`gpt-agent-process.md` is written against the agent API's operation names. Each
maps to one MCP tool. The historical review gate's four reads also have a
single composite, `get_review_context`.

| Process document says | Use tool | Notes |
|-----------------------|----------|-------|
| `getFundState` | `get_fund_state` | `include_watchlist`, `recent_decisions` |
| `getPortfolio` | `get_portfolio` | |
| `getPerformance` | `get_performance` | `from` / `to` |
| `getJournal?symbol=…` | `get_journal` | `horizon_due`, `graded`, `decision_type` (`material`) |
| `getCalibrationStatus` | `get_calibration_status` | |
| `getPlannedActions` | `list_planned_actions` | |
| `getResearchInbox` | `get_research_inbox` | `kinds` |
| `getReviewQueue?status=…` | `list_reviews` | `status` is a list; `symbols` / `themes` are lists |
| `getCompanyDossier` | `get_dossier` | |
| `getDossierVersions` | `list_dossier_versions` | |
| `getDossierVersion` | `get_dossier_version` | number or `dossier_version.id` |
| The historical review gate's reads (journal + completed reviews by symbol/theme + `scope=portfolio` chain + dossier) | `get_review_context` | One call; fails whole rather than partial |
| `updateDossier` | `update_dossier` | `expected_version` required; `null` for a first dossier |
| `createDecision` | `record_decision` | |
| `recordDecisionOutcome` | `record_decision_outcome` | `decision_id` = journal entry `id`; `horizon_days` required |
| `createPlannedAction` | `create_planned_action` | |
| `updatePlannedAction` | `update_planned_action` | status: pending / deferred / cancelled |
| `createReviewTask` | `create_review_task` | |
| `updateReviewTask` | `update_review_task` | cannot set due / completed |
| `completeReviewTask` | `complete_review_task` | |
| `addWatchlistCompany` | `add_watchlist_company` | |
| `setWatchlistArchived` | `set_watchlist_archived` | refused while a position is open |

The process document's older line "the agent cannot archive" predates
`setWatchlistArchived`. Archiving is available, and only on the operator's
explicit request.
