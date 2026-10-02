import { z } from "zod";

/**
 * Output schemas for every tool, advertised in tools/list and enforced by the
 * SDK on each successful result.
 *
 * Two rules keep them from ever turning a good answer into an error:
 *
 * - Every field is optional. The agent API drops null fields (`agentJson`
 *   → `omitNulls`), so a nullable field is simply absent.
 * - Every object is open (`looseObject`). A response gaining a field must not
 *   break a client; the schema documents the fields a model should rely on.
 *
 * The SDK validates *after* the handler has run. A schema stricter than the
 * API would turn a write that landed into an error result, so these describe
 * the real shapes (read from the services in lib/agent, lib/dossiers,
 * lib/journal, lib/reviews, lib/planned-actions, lib/watchlist) at top-level
 * granularity. outputs.test.ts runs every tool's schema against its result.
 */

const obj = () => z.looseObject({});
// .describe() goes on the optional wrapper: that is the node JSON Schema
// generation reads, so it is what a client actually sees.
const str = (description: string) => z.string().optional().describe(description);
const num = (description: string) => z.number().optional().describe(description);
const bool = (description: string) => z.boolean().optional().describe(description);
const list = (description: string) => z.array(obj()).optional().describe(description);
const section = (description: string) => obj().optional().describe(description);
const notes = (description: string) => z.array(z.string()).optional().describe(description);

const freshness = {
  price_data_through: str("Last US cash session the prices in this response reach."),
  price_data_stale: bool("True when the last completed US cash session is missing: do not treat closes as current."),
};

const reviewTask = section(
  "The review task: id, title, instructions, scope, priority, status, trigger, symbols, themes, dates, outcome, outputs.",
);
const plannedAction = section(
  "The planned action: id, symbol, action_type, status, planned_usd, window_label, due_by, rationale (with the [agent:…] stamp), timestamps.",
);

const reviewQueue = {
  as_of: str("When the response was built."),
  marked_due: num("Reviews recorded pending → due by this read (0 for MCP reads)."),
  previewed_due: num("Reviews shown as due because their trigger has fired, not yet recorded."),
  filter: section("The filter actually applied."),
  returned: num("Tasks returned."),
  truncated: bool("More tasks match than were returned: raise limit or narrow the window."),
  tasks: list("Review tasks. due_by_trigger: true marks a fired trigger not yet recorded."),
};

export const TOOL_OUTPUTS: Record<string, z.ZodRawShape> = {
  get_fund_state: {
    as_of: str("When the snapshot was built."),
    mandate: section("Mandate reference and numeric risk defaults."),
    goals: section("Goals reference."),
    cash: section("Cash in dollars and as % of NAV."),
    portfolio: section("NAV, invested cost vs the capital-phase cap, flags."),
    holdings: list("Open positions with size and weight."),
    theme_exposure: list("Weight by theme."),
    planned_actions: list("The open deployment queue."),
    due_reviews: list("Review tasks due now (due_by_trigger marks a fired trigger not yet recorded)."),
    upcoming_reviews: list("Pending review tasks, soonest first."),
    recent_decisions: list("Recent journal entries."),
    dossiers: list("Every dossier's status, research level and current version number."),
    watchlist: list("The research universe (omitted when include_watchlist is false)."),
    themes: list("Themes (omitted when include_watchlist is false)."),
  },
  get_portfolio: {
    as_of: str("When the book was read."),
    ...freshness,
    nav_usd: num("Net asset value, dollars."),
    invested_cost_usd: num("Invested cost, dollars — compare with the capital-phase cap."),
    market_value_usd: num("Market value of positions, dollars."),
    unrealized_pnl_usd: num("Unrealized P&L, dollars."),
    realized_pnl_usd: num("Realized P&L, dollars."),
    deposited_capital_usd: num("Capital deposited, dollars."),
    cash: section("usd, pct_nav, updated_at."),
    holdings: list("Positions: symbol, quantity, avg_cost, last_close, last_close_session, weight_pct_nav, invalidation."),
    theme_exposure: list("Weight by theme."),
    flags: list("Mandate flags, including the kill-switch diagnostic (due: false means ritual 11 is done for this breach)."),
    mark: section("How positions are marked and as of when."),
  },
  get_performance: {
    as_of: str("When the response was built."),
    ...freshness,
    units: str("Returns are in percent."),
    success_benchmark: str("Primary benchmark."),
    style_benchmark: str("Style benchmark."),
    drawdown: section("nav_current_pct, nav_max_pct, deployed_current_pct, deployed_max_pct (unitized)."),
    windows: list("Return windows: nav, deployed, SPY and QQQ returns and relatives, in percent."),
    contribution: section("Dollar contribution by ticker, theme and factor (pnl_usd is dollars, not TWR)."),
    notes: notes("How to read the numbers."),
  },
  get_risk_snapshot: {
    as_of: str("When the snapshot was computed."),
    ...freshness,
    nav_usd: num("Net asset value, dollars, cash included."),
    deployed_usd: num("Market value of positions, dollars."),
    correlation: section("method, window (calendar_days, from, through per symbol), held_symbols, pairs: a, b, correlation, observations, both_held."),
    concentration: section("ai_capex_pct_nav, ai_memory_pct_nav, diversifier_pct_nav, themes, the caps, unclassified symbols."),
    hyperscaler_capex_stress: section("shock_pct, nav_impact_usd / _pct (negative), stressed_nav_usd, by_holding, by_theme, by_factor, assumptions."),
    notes: notes("How to read the numbers."),
  },
  get_research_inbox: {
    as_of: str("When the inbox was derived."),
    returned: num("Items returned."),
    items: list("kind (needs_dossier | review_due_date | diligence), symbol, name, due_since, age_days, reason."),
  },
  get_review_context: {
    symbol: str("The symbol loaded."),
    theme: str("The theme loaded."),
    reading_order: str("How to read the sections."),
    dossier: section("The live dossier, as get_dossier returns it."),
    journal: section("Recent journal entries for the symbol, as get_journal returns them."),
    linked_review_history: section("Completed reviews linked to the symbol or theme, as list_reviews returns them."),
    portfolio_review_chain: section("Completed book-level (scope=portfolio) reviews, newest first."),
    open_reviews: section("Open reviews on the name or theme."),
    open_planned_actions: list("Open planned actions for the symbol."),
  },
  get_dossier: {
    as_of: str("When the dossier was read."),
    ...freshness,
    symbol: str("Ticker."),
    name: str("Company name."),
    asset_class: str("Asset class."),
    status: str("Instrument status: watchlist, active or archived."),
    notes: str("Instrument notes."),
    theme: section("Primary theme: slug and name."),
    last_close: num("Latest close."),
    last_close_session: str("Session of the latest close."),
    dossier: section("Live dossier: summary, thesis, catalysts, risks, invalidation, next_diligence, next_review_at, verified_at, status, research_level."),
    current_version: section("Current version: id and number (pass number as update_dossier's expected_version)."),
  },
  list_dossier_versions: {
    as_of: str("When the history was read."),
    symbol: str("Ticker."),
    current_version_number: num("Latest version number (0 when there is none)."),
    versions: list("Version headers, newest first: id, number, change_reason, created_at."),
  },
  get_dossier_version: {
    as_of: str("When the version was read."),
    symbol: str("Ticker."),
    version: section("id, number, change_reason, created_at, and snapshot — the dossier exactly as it stood."),
  },
  get_journal: {
    as_of: str("When the journal was read."),
    ...freshness,
    count: num("Entries in this page."),
    next_before: str("Pass as before to page further back."),
    notes: notes("How to read the entries."),
    entries: list("Decisions: id (the decision_id), symbol, decision_type, thesis, action_at, dossier_version, relative_returns, outcomes."),
  },
  get_calibration_status: {
    as_of: str("When the worklist was built."),
    due_count: num("Decisions owed a grade."),
    due_by_class: section("Owed grades by decision class."),
    due: list("Owed grades: decision_id, symbol, decision_type, decision_class, due_horizons."),
    graded: section("What has been recorded: total, distinct_decisions, by_horizon."),
    ungradeable_count: num("Decisions that can never be graded."),
    ungradeable: list("Ungradeable decisions and why (no_fill)."),
    notes: notes("How to scope and reconcile a grading run."),
  },
  list_planned_actions: {
    as_of: str("When the queue was read."),
    total_planned_usd: num("Dollars across the open queue."),
    cash_after_usd: num("Cash if every planned action filled."),
    cash_pct_after: num("Cash % of NAV if every planned action filled."),
    invested_after_usd: num("Invested cost if every planned action filled."),
    flags: list("Mandate flags the queue would trip."),
    actions: list("Planned actions: id, symbol, action_type, status, planned_usd, planned_pct_nav, window_label, due_by, rationale."),
  },
  list_reviews: reviewQueue,
  update_dossier: {
    symbol: str("Ticker."),
    changed: bool("False when the content was identical and no version was written."),
    version: section("The current version after the write: id, number, change_reason."),
  },
  record_decision: {
    created: bool("True when the entry was written."),
    decision: section("The journal entry: id (the decision_id), symbol, decision_type, action_at, pinned dossier_version."),
  },
  record_decision_outcome: {
    recorded: bool("True when the grade was written."),
    outcome: section("The grade: id, decision_id, horizon_days, the four grades, lessons, recorded_at."),
  },
  create_planned_action: {
    created: bool("True when the action was queued."),
    planned_action: plannedAction,
  },
  update_planned_action: {
    updated: bool("True when the action was changed."),
    planned_action: plannedAction,
  },
  create_review_task: {
    created: bool("True when the review was added."),
    review_task: reviewTask,
  },
  update_review_task: {
    updated: bool("True when the review was changed."),
    review_task: reviewTask,
  },
  complete_review_task: {
    completed: bool("True when the review was closed."),
    review_task: reviewTask,
  },
  add_watchlist_company: {
    created: bool("True when the name was added."),
    company: section("The new instrument: symbol, name, status (watchlist), theme."),
  },
  set_watchlist_archived: {
    symbol: str("Ticker."),
    status: str("The instrument's status after the call."),
    changed: bool("False when it was already in that state."),
  },
};

export function outputSchemaFor(name: string) {
  const shape = TOOL_OUTPUTS[name];
  if (!shape) throw new Error(`No output schema for tool ${name}`);
  return z.looseObject(shape);
}
