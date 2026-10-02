import { describe, expect, it } from "vitest";

import { TOOL_OUTPUTS, outputSchemaFor } from "./outputs";
import { POWERFUND_TOOLS } from "./tools";

/**
 * Representative results in the shapes the agent API actually returns
 * (after omitNulls), one per tool. The schemas must accept them, an empty
 * object (every field absent), and fields they do not know about.
 */
const SAMPLES: Record<string, Record<string, unknown>> = {
  get_fund_state: {
    as_of: "2026-09-29T00:00:00Z",
    mandate: { slug: "mandate", risk_defaults: {} },
    cash: { usd: 220506.2, pct_nav: 88.2 },
    portfolio: { nav_usd: 250000, flags: [] },
    holdings: [{ symbol: "VRT", weight_pct_nav: 1.2 }],
    theme_exposure: [],
    planned_actions: [{ id: "p", symbol: "CLS" }],
    due_reviews: [{ id: "r", due_by_trigger: true }],
    upcoming_reviews: [],
    recent_decisions: [],
    dossiers: [{ symbol: "CLS", current_version_number: 0 }],
    watchlist: [{ symbol: "CLS", theme: { slug: "ai-infrastructure" } }],
    themes: [{ slug: "energy", is_core: true }],
  },
  get_portfolio: {
    nav_usd: 250000,
    invested_cost_usd: 27500,
    cash: { usd: 220506.2, pct_nav: 88.2 },
    holdings: [{ symbol: "VRT", quantity: 16.86, last_close_session: "2026-09-25" }],
    flags: [{ code: "position_cap", due: false }],
    mark: { label: "close", as_of: "2026-09-25" },
  },
  get_performance: {
    as_of: "2026-09-29",
    price_data_through: "2026-09-25",
    price_data_stale: false,
    units: "percent",
    drawdown: { nav_max_pct: -2.1 },
    windows: [{ id: "itd", nav_return_pct: 1.2 }],
    contribution: { tickers: [] },
    notes: ["percent"],
  },
  get_risk_snapshot: {
    as_of: "2026-10-02T12:00:00Z",
    price_data_through: "2026-10-01",
    price_data_stale: false,
    nav_usd: 250000,
    correlation: { pairs: [{ a: "VRT", b: "SNDK", correlation: 0.41 }] },
    concentration: { ai_capex_pct_nav: 8.2 },
    hyperscaler_capex_stress: { nav_impact_usd: -4100, by_holding: [] },
    notes: ["read-only"],
  },
  get_research_inbox: { as_of: "x", returned: 1, items: [{ kind: "diligence", symbol: "AVGO" }] },
  get_review_context: {
    symbol: "SNDK",
    reading_order: "journal → …",
    dossier: { symbol: "SNDK" },
    journal: { entries: [] },
    linked_review_history: { tasks: [] },
    portfolio_review_chain: { tasks: [] },
    open_reviews: { tasks: [] },
    open_planned_actions: [],
  },
  get_dossier: {
    symbol: "SNDK",
    last_close: 81.2,
    theme: { slug: "ai-infrastructure" },
    dossier: { thesis: "t" },
    current_version: { id: "v", number: 3 },
    price_data_stale: false,
  },
  list_dossier_versions: { symbol: "SNDK", current_version_number: 3, versions: [{ number: 3 }] },
  get_dossier_version: { symbol: "SNDK", version: { number: 3, snapshot: {} } },
  get_journal: { count: 1, next_before: "2026-08-01", notes: ["n"], entries: [{ id: "d" }] },
  get_calibration_status: {
    due_count: 1,
    due_by_class: { continuation: 1 },
    due: [{ decision_id: "d", due_horizons: [30] }],
    graded: { total: 15, distinct_decisions: 15, by_horizon: {} },
    ungradeable_count: 2,
    ungradeable: [],
    notes: ["n"],
  },
  list_planned_actions: { total_planned_usd: 10000, cash_pct_after: 84, flags: [], actions: [{ id: "p" }] },
  list_reviews: { marked_due: 0, previewed_due: 1, returned: 1, truncated: false, filter: {}, tasks: [{ id: "r" }] },
  update_dossier: { symbol: "CLS", changed: true, version: { number: 1 } },
  record_decision: { created: true, decision: { id: "d" } },
  record_decision_outcome: { recorded: true, outcome: { id: "o", horizon_days: 30 } },
  create_planned_action: { created: true, planned_action: { id: "p" } },
  update_planned_action: { updated: true, planned_action: { id: "p" } },
  create_review_task: { created: true, review_task: { id: "r" } },
  update_review_task: { updated: true, review_task: { id: "r" } },
  complete_review_task: { completed: true, review_task: { id: "r" } },
  add_watchlist_company: { created: true, company: { symbol: "HII" } },
  set_watchlist_archived: { symbol: "HII", status: "archived", changed: true },
};

describe("tool output schemas", () => {
  it("exist for every tool, and only for real tools", () => {
    expect(Object.keys(TOOL_OUTPUTS).sort()).toEqual(POWERFUND_TOOLS.map((tool) => tool.name).sort());
  });

  it.each(POWERFUND_TOOLS.map((tool) => tool.name))("%s accepts a realistic result", (name) => {
    expect(outputSchemaFor(name).safeParse(SAMPLES[name]).success).toBe(true);
  });

  it.each(POWERFUND_TOOLS.map((tool) => tool.name))(
    "%s can never be stricter than the API: all fields absent, unknown fields present",
    (name) => {
      const schema = outputSchemaFor(name);
      expect(schema.safeParse({}).success).toBe(true);
      expect(schema.safeParse({ ...SAMPLES[name], a_future_field: [1, { x: null }] }).success).toBe(true);
    },
  );

  it("still catches a genuinely wrong type, so it is not a blank cheque", () => {
    expect(outputSchemaFor("get_portfolio").safeParse({ nav_usd: "a lot" }).success).toBe(false);
    expect(outputSchemaFor("record_decision").safeParse({ created: "yes" }).success).toBe(false);
  });

  it("describes every field for the model", () => {
    for (const [name, shape] of Object.entries(TOOL_OUTPUTS)) {
      for (const [key, field] of Object.entries(shape)) {
        expect((field as { description?: string }).description, `${name}.${key}`).toBeTruthy();
      }
    }
  });
});
