import type { ContributionReport } from "@powerfund/domain";

import { validationError } from "@/lib/api/agent/errors";
import {
  loadContributionReport,
  resolvedContributionRange,
} from "@/lib/data/contribution";
import {
  buildPerformanceReport,
  loadLivePerformanceMark,
  type PerformanceRange,
  type PerformanceReport,
  type PerformanceWindowReport,
} from "@/lib/data/performance";
import type { DbClient } from "@/lib/supabase/db";

function pctFromFraction(value: number | null): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(value * 1000) / 10;
}

function pp(value: number | null): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(value * 10) / 10;
}

function parseDay(raw: string | null, field: "from" | "to"): string | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const day = raw.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw validationError(`Invalid ${field}. Use YYYY-MM-DD.`, { field });
  }
  if (Number.isNaN(Date.parse(`${day}T00:00:00Z`))) {
    throw validationError(`Invalid ${field}. Use YYYY-MM-DD.`, { field });
  }
  return day;
}

export function parsePerformanceRange(url: URL): PerformanceRange | undefined {
  const from = parseDay(url.searchParams.get("from"), "from");
  const to = parseDay(url.searchParams.get("to"), "to");
  if (from == null && to == null) return undefined;
  if (from != null && to != null && from > to) {
    throw validationError("`from` must be on or before `to`.", { from, to });
  }
  return { from, to };
}

function toAgentWindow(window: PerformanceWindowReport) {
  return {
    id: window.id,
    label: window.label,
    start: window.start,
    end: window.end,
    points: window.points,
    nav_return_pct: pctFromFraction(window.navReturn),
    deployed_return_pct: pctFromFraction(window.deployedReturn),
    spy_return_pct: pctFromFraction(window.successReturn),
    qqq_return_pct: pctFromFraction(window.styleReturn),
    nav_vs_spy_pct: pctFromFraction(window.navVsSuccess),
    nav_vs_qqq_pct: pctFromFraction(window.navVsStyle),
    deployed_vs_spy_pct: pctFromFraction(window.deployedVsSuccess),
    deployed_vs_qqq_pct: pctFromFraction(window.deployedVsStyle),
    nav_drawdown_pct: pp(window.navDrawdownPct),
    nav_max_drawdown_pct: pp(window.navMaxDrawdownPct),
    deployed_drawdown_pct: pp(window.deployedDrawdownPct),
    deployed_max_drawdown_pct: pp(window.deployedMaxDrawdownPct),
  };
}

function toAgentContribution(report: ContributionReport) {
  return {
    start: report.start,
    end: report.end,
    trading_days: report.tradingDays,
    method: report.method,
    tickers: report.tickers.map((row) => ({
      symbol: row.symbol,
      theme: { slug: row.themeSlug, name: row.themeName },
      pnl_usd: row.pnlUsd,
      realized_usd: row.realizedUsd,
      income_usd: row.incomeUsd,
      start_market_value_usd: row.startMarketValueUsd,
      end_market_value_usd: row.endMarketValueUsd,
      avg_weight_pct_nav: row.avgWeightPctNav,
      avg_weight_pct_deployed: row.avgWeightPctDeployed,
      days_held: row.daysHeld,
    })),
    themes: report.themes.map((row) => ({
      key: row.key,
      name: row.name,
      pnl_usd: row.pnlUsd,
      avg_weight_pct_nav: row.avgWeightPctNav,
    })),
    factors: report.factors.map((row) => ({
      key: row.key,
      name: row.name,
      pnl_usd: row.pnlUsd,
      avg_weight_pct_nav: row.avgWeightPctNav,
    })),
    notes: report.notes,
  };
}

export function toAgentPerformance(
  report: PerformanceReport,
  contribution: ContributionReport,
) {
  return {
    as_of: report.asOf,
    success_benchmark: "S&P 500 TR (SPY)",
    style_benchmark: "Nasdaq-100 TR (QQQ)",
    units: "percent",
    drawdown: {
      nav_current_pct: pp(report.drawdown.navCurrentPct),
      nav_max_pct: pp(report.drawdown.navMaxPct),
      deployed_current_pct: pp(report.drawdown.deployedCurrentPct),
      deployed_max_pct: pp(report.drawdown.deployedMaxPct),
    },
    windows: report.windows.map(toAgentWindow),
    contribution: toAgentContribution(contribution),
    notes: [
      ...report.notes,
      ...contribution.notes,
      "Return *_pct fields are percent (1.2 means 1.2%). Contribution pnl_usd is dollars, not TWR. Per-decision 30/90/180d returns are not in this payload.",
    ],
  };
}

export async function getAgentPerformance(
  supabase: DbClient,
  range?: PerformanceRange,
) {
  const live = await loadLivePerformanceMark(supabase);
  const window = resolvedContributionRange(range, live.asOf);
  const [report, contribution] = await Promise.all([
    buildPerformanceReport(supabase, live, range),
    loadContributionReport(supabase, window),
  ]);
  return toAgentPerformance(report, contribution);
}
