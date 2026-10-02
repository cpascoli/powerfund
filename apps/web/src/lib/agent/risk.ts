import { factorExposures, RISK_DEFAULTS, roundPercent } from "@powerfund/domain";

import { freshnessPayload } from "@/lib/data/price-freshness";
import { CORRELATION_WINDOW_DAYS, getRiskView, type RiskView } from "@/lib/data/risk";
import type { DbClient } from "@/lib/supabase/db";

/**
 * Workbench → Risk for the agent: the same `getRiskView` the operator page
 * renders, reshaped. Nothing here computes risk — every number is the
 * Workbench's, so a quarterly review can quote it without a manual paste and
 * without a second model that could disagree with the page.
 */

export type RiskSnapshotQuery = {
  /** "holdings" (default): pairs where both names are held. "all": every pair in the Workbench matrix. */
  universe?: "holdings" | "all";
  /** Drop pairs whose |correlation| is below this. Null correlations are kept only when unset. */
  min_abs_correlation?: number;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number | null): number | null {
  return value == null ? null : Math.round(value * 1000) / 1000;
}

function pctOrNull(value: number | null): number | null {
  return value == null || Number.isNaN(value) ? null : roundPercent(value);
}

export function toRiskSnapshot(view: RiskView, query: RiskSnapshotQuery = {}) {
  const universe = query.universe ?? "holdings";
  const held = new Set(view.heldSymbols);
  const threshold = query.min_abs_correlation;
  const pairs = view.pairs
    .filter((pair) => universe === "all" || (held.has(pair.a) && held.has(pair.b)))
    .filter((pair) =>
      threshold == null ? true : pair.correlation != null && Math.abs(pair.correlation) >= threshold,
    )
    .sort((x, y) => (y.correlation ?? -Infinity) - (x.correlation ?? -Infinity))
    .map((pair) => ({
      a: pair.a,
      b: pair.b,
      correlation: round3(pair.correlation),
      observations: pair.observations,
      both_held: held.has(pair.a) && held.has(pair.b),
    }));
  const nav = view.nav;

  return {
    as_of: view.asOf,
    ...freshnessPayload(view.priceDataThrough, view.asOf),
    nav_usd: round2(nav),
    deployed_usd: round2(view.deployed),
    correlation: {
      method:
        "Pearson correlation of overlapping daily log-returns of split-adjusted closes (adj_close, else close). Null when two names share fewer than 20 return days.",
      window: {
        calendar_days: CORRELATION_WINDOW_DAYS,
        from: view.correlationFrom,
        through: view.seriesThrough,
      },
      universe,
      matrix_symbols: view.symbols,
      held_symbols: view.heldSymbols,
      held_without_history: view.heldSymbols.filter((symbol) => !view.symbols.includes(symbol)),
      min_abs_correlation: threshold ?? null,
      pairs,
    },
    concentration: {
      ai_capex_pct_nav: pctOrNull(view.aiCapexPct),
      ai_capex_cap_pct_nav: RISK_DEFAULTS.maxAiCapexFactorPctNav,
      ai_memory_pct_nav: pctOrNull(view.aiMemoryPct),
      ai_memory_guide_pct_nav: RISK_DEFAULTS.maxAiMemorySleevePctNav,
      diversifier_pct_nav: pctOrNull(view.diversifierPct),
      themes: view.stress.byTheme.map((theme) => ({
        slug: theme.themeSlug,
        name: theme.themeName,
        market_value_usd: round2(theme.marketValue),
        weight_pct_nav: nav > 0 ? roundPercent((theme.marketValue / nav) * 100) : null,
      })),
      theme_cap_pct_nav: RISK_DEFAULTS.maxThemePctNav,
      unclassified: view.stress.unclassified,
    },
    hyperscaler_capex_stress: {
      shock_pct: roundPercent(view.stress.shock * 100),
      nav_impact_usd: -round2(view.stress.navDelta),
      nav_impact_pct: view.stress.navDeltaPct == null ? null : -roundPercent(view.stress.navDeltaPct),
      stressed_nav_usd: round2(view.stress.stressedNav),
      by_holding: view.stress.rows.map((row) => ({
        symbol: row.symbol,
        theme: row.themeSlug,
        market_value_usd: round2(row.marketValue),
        ai_capex_weight: row.aiCapexWeight,
        ai_memory_weight: row.aiMemoryWeight,
        factor_weights: factorExposures(row.symbol),
        impact_usd: -round2(row.delta),
        impact_pct_nav: nav > 0 ? -roundPercent((row.delta / nav) * 100) : null,
        unclassified: row.aiCapexWeight == null,
      })),
      by_theme: view.stress.byTheme.map((theme) => ({
        slug: theme.themeSlug,
        name: theme.themeName,
        impact_usd: -round2(theme.delta),
        impact_pct_nav: nav > 0 ? -roundPercent((theme.delta / nav) * 100) : null,
      })),
      by_factor: [
        {
          factor: "ai_capex",
          impact_usd: -round2(view.stress.navDelta - sum(view.stress.rows.map((row) => row.memoryDelta))),
        },
        { factor: "ai_memory", impact_usd: -round2(sum(view.stress.rows.map((row) => row.memoryDelta))) },
      ],
      assumptions: [
        "Mandate rule 10's standing stress: every holding loses shock × its AI-capex weight. The weight is ai_capex + ai_memory from the reviewed factor map; ai_memory counts fully.",
        "Other factor loadings (defence, nuclear, grid, robotics, other) and cash are unshocked. Unclassified holdings are left unchanged and listed under concentration.unclassified for review.",
        "Market values are the book's stored closes (price_data_through), not live quotes. NAV includes cash.",
        "A sizing discipline, not a forecast: no second-order effects, no correlation scaling, no beta.",
      ],
    },
    notes: [
      "Read-only. These are the exact Workbench → Risk calculations; quote them, do not recompute them.",
      "Percent fields are percent (1.2 means 1.2%). Impacts are negative numbers.",
      "If price_data_stale is true, the closes behind every number here miss the last completed US cash session.",
    ],
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export async function getRiskSnapshot(supabase: DbClient, query: RiskSnapshotQuery = {}) {
  return toRiskSnapshot(await getRiskView(supabase), query);
}
