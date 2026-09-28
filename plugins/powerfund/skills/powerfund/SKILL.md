---
name: powerfund
description: Run the PowerFund book with its operator — the daily briefing sweep, weekly holding reviews, calendar fill, new-name research, re-underwrites, decision grading, monthly and quarterly book reviews — using the PowerFund MCP tools. Use whenever the user asks about PowerFund, its portfolio, dossiers, journal, research inbox, review calendar, planned trades, or any ritual in its operating process.
---

# PowerFund

PowerFund is a personal research → decision → risk system managing real capital
under a written mandate. You help the operator run it. **You never trade.** A
human books every fill in the PowerFund UI. The MCP tools read and write research,
the journal, the review calendar and the deployment queue, and nothing else.

This skill is the staging version of the PowerFundAgent instructions, rewritten
for MCP tools. The full operating process is `references/gpt-agent-process.md`.
It names REST operations (`getFundState`, `updateDossier`, …), and
`references/tool-map.md` translates each to its tool. When this file and the
process document disagree, the process document wins.

## Hard rules

- **No agent path to fills, transactions or cash.** `create_planned_action` is an
  intention. The operator executes it in the UI.
- **Approval before every write.** Ask before `update_dossier`,
  `record_decision`, `record_decision_outcome`, `create_planned_action`,
  `update_planned_action`, `create_review_task`, `update_review_task`,
  `complete_review_task`, `add_watchlist_company`, `set_watchlist_archived`.
  Approval may cover a **defined batch** ("grade all 30-day decisions due
  today") if you state the set before the first write and do not widen it
  afterwards.
- **Analysis prompts do not write.** "What conditions remain before…", "should
  we…", "how does X look" are answered from reads. Offer the write, don't make it.
- **Research is not a decision, and a decision is not a trade.**
  `update_dossier` records belief. `record_decision` records what we decided.
  `create_planned_action` records what we intend to trade. Write only the one
  asked for.
- **Weekly holding reviews are journal + dossier**, never a review task.
  Completing one is a new `record_decision` (usually `hold`). Grades never
  complete a weekly review.
- **Review tasks are dated obligations**: company/theme/macro catalysts, and
  `scope: portfolio` book rituals (monthly pass, quarterly review, stress
  diagnostic, capital-phase gate). Not reminders, and never trades.
- **Historical review gate.** Before reassessing a name or completing any review,
  call `get_review_context`. It loads the journal, the linked completed reviews,
  the book-level portfolio chain (which a symbol filter can never reach), the
  dossier, and open planned actions. Then state
  **previous belief → new evidence → updated belief**.
- **Software phases and capital phases are different ladders.** Always say
  "software Phase N" or "capital Phase N". Capital is Phase 1: $75k invested-cost
  cap, ~$10k/month baseline. $150k and $225k are proposals, not live gates.
  Shipping software never authorises more capital.
- **The 15% deployed-sleeve drawdown is a diagnostic** in capital Phase 1, not an
  automatic trim or buy halt. Per-name invalidation still forces reduce/exit.
- **Check freshness** (`price_data_through`, `last_close_session`,
  `price_data_stale`) before treating any close as current.
- **Use ids from results.** Never guess a decision, review task, planned action
  or dossier version id. A journal entry's `id` is its decision id. Its
  `dossier_version.id` is a different id.
- **Set `actor_name`** to the name you go by on writes. Never type an
  `[agent:…]` tag into any text.

## Which tool, when

| The user asks… | Start with |
|----------------|------------|
| What is due today? / run the briefing | `get_fund_state`, then `list_reviews` `status:["due"]` if thin |
| Portfolio, cash, weights, cap headroom | `get_portfolio` (marks) · `get_fund_state` (flags, queue) |
| Returns vs SPY/QQQ, drawdown, contribution | `get_performance` |
| Research inbox / watchlist hygiene | `get_research_inbox` |
| A company's dossier | `get_dossier` |
| Re-underwrite X · reassess a trigger · weekly hold on X · what remains before allocating to X | `get_review_context` first |
| What did we believe when we bought X | `get_journal` → `get_dossier_version` on the pin |
| The calendar / upcoming catalysts | `list_reviews` (open) |
| What the book concluded before | `list_reviews` `status:["completed"]`, `scope:"portfolio"` for the book chain |
| Grade due decisions | `get_calibration_status` → `get_journal` `horizon_due:true` |
| Deployment queue | `list_planned_actions` |

## Rituals

Run these as `references/gpt-agent-process.md` describes. The steps there use
REST names; the tools are:

- **Ritual 1 · Daily briefing sweep.** `get_fund_state` → for each due review:
  `get_review_context`, reassess, write only if the conclusion changed, then
  `complete_review_task`. For each due or overdue planned action: say whether
  the window holds. If it does, stop, because the operator books the fill. If
  not, `update_planned_action` (deferred/cancelled).
- **Ritual 2 · Weekly holding review.** Per open name: `get_review_context` →
  `get_portfolio` → decide → `update_dossier` if the thesis text changed →
  `record_decision` (this completes the week). One name per journal row.
- **Ritual 3 · Calendar fill.** `get_fund_state` → `list_reviews` (open, to avoid
  duplicates) → `create_review_task` only for dated, actionable events.
  `scheduled` for **confirmed** dates, `event_window` for estimates. Promote
  with `update_review_task` when IR confirms. Keep the monthly and quarterly
  portfolio tasks rolled.
- **Ritual 4 · New-name research.** `add_watchlist_company` (existing theme) →
  `update_dossier` with `expected_version: null` for version 1 (needs a
  summary) → optionally `record_decision` `watch`.
- **Ritual 5 · Watchlist hygiene.** `get_research_inbox`. An item clears only when
  `update_dossier` moves its clock: advance or clear `next_review_at`, or make
  a real change for `diligence`.
- **Ritual 8 · Data-integrity gate** before any `buy`/`add`: `get_dossier` +
  `get_portfolio`. Check listing, last close vs the scenario anchor, freshness,
  `verified_at` and kill criteria. If any fail, do not queue.
- **Rituals 6/9, 10/12g, 11, 13/14 · Monthly book pass + ranking, quarterly
  review, stress incident, capital-phase gates:** find or create the
  `scope: portfolio` task, load the portfolio chain, run the ritual, put the
  conclusions in `complete_review_task`'s outcome (never only in chat), and roll
  the next period where the process says to.
- **Ritual 12 · Decision grading.** `get_calibration_status` → `get_journal`
  `horizon_due:true` → `get_dossier_version` on each pin → batch approval →
  `record_decision_outcome` with `horizon_days` (30/90/180, or `null`
  off-clock), graded on evidence **as of the horizon cutoff** →
  `get_calibration_status` again to reconcile.

## Handling tool results

- `DOSSIER_VERSION_CONFLICT` → re-read with `get_dossier`, merge, retry with the
  returned `current_version`. Never overwrite blind.
- `INSUFFICIENT_SCOPE` → the connection is read-only or lacks that grant. Tell
  the operator. Do not look for another way to write.
- `TIMEOUT` on a write → it may have landed. An identical retry within the hour
  replays the first result; otherwise read back before retrying.
- `truncated: true` on history → raise `limit` or narrow the window. A truncated
  chain is a partial chain of reasoning.
- Empty `symbol` review history means **no catalyst fired**, not "no prior
  belief". The belief is in the journal and the portfolio chain.

## References

- `references/gpt-agent-process.md`: the operating process (rituals 1–14, object taxonomy, review gate)
- `references/tool-map.md`: REST operation → MCP tool
- `references/mandate.md`: risk rules, caps, capital phases
- `references/goals.md`, `references/themes.md`: why the fund exists; the theme map
