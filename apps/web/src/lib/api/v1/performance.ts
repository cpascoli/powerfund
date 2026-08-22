import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildPerformanceReport,
  loadLivePerformanceMark,
  type PerformanceReport,
  type PerformanceWindowReport,
} from "@/lib/data/performance";

export type PublicPerformanceWindow = {
  id: string;
  label: string;
  start: string;
  end: string;
  nav_return_pct: number | null;
  deployed_return_pct: number | null;
  spy_return_pct: number | null;
  qqq_return_pct: number | null;
  nav_vs_spy_pct: number | null;
  nav_vs_qqq_pct: number | null;
  deployed_vs_spy_pct: number | null;
  deployed_vs_qqq_pct: number | null;
  nav_max_drawdown_pct: number | null;
  deployed_max_drawdown_pct: number | null;
};

export type PublicPerformance = {
  success_benchmark: "S&P 500 TR (SPY)";
  style_benchmark: "Nasdaq-100 TR (QQQ)";
  windows: PublicPerformanceWindow[];
  drawdown: {
    nav_current_pct: number | null;
    nav_max_pct: number | null;
    deployed_current_pct: number | null;
    deployed_max_pct: number | null;
  };
  notes: string[];
};

function pct1(value: number | null): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(value * 1000) / 10;
}

function pp1(value: number | null): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(value * 10) / 10;
}

function toPublicWindow(
  window: PerformanceWindowReport,
): PublicPerformanceWindow {
  return {
    id: window.id,
    label: window.label,
    start: window.start,
    end: window.end,
    nav_return_pct: pct1(window.navReturn),
    deployed_return_pct: pct1(window.deployedReturn),
    spy_return_pct: pct1(window.successReturn),
    qqq_return_pct: pct1(window.styleReturn),
    nav_vs_spy_pct: pct1(window.navVsSuccess),
    nav_vs_qqq_pct: pct1(window.navVsStyle),
    deployed_vs_spy_pct: pct1(window.deployedVsSuccess),
    deployed_vs_qqq_pct: pct1(window.deployedVsStyle),
    nav_max_drawdown_pct: pp1(window.navMaxDrawdownPct),
    deployed_max_drawdown_pct: pp1(window.deployedMaxDrawdownPct),
  };
}

export function toPublicPerformance(
  report: PerformanceReport,
): PublicPerformance {
  return {
    success_benchmark: "S&P 500 TR (SPY)",
    style_benchmark: "Nasdaq-100 TR (QQQ)",
    windows: report.windows.map(toPublicWindow),
    drawdown: {
      nav_current_pct: pp1(report.drawdown.navCurrentPct),
      nav_max_pct: pp1(report.drawdown.navMaxPct),
      deployed_current_pct: pp1(report.drawdown.deployedCurrentPct),
      deployed_max_pct: pp1(report.drawdown.deployedMaxPct),
    },
    notes: report.notes,
  };
}

export async function getPublicPerformance(): Promise<PublicPerformance> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const live = await loadLivePerformanceMark(supabase);
  const report = await buildPerformanceReport(supabase, live);
  return toPublicPerformance(report);
}

export function performanceMarkdown(report: PublicPerformance): string {
  const cellPct = (value: number | null) =>
    value == null ? "—" : `${value}%`;
  const lines = [
    "# Performance",
    "",
    `Success benchmark: ${report.success_benchmark}. Style benchmark: ${report.style_benchmark}. No blend. Percentages only.`,
    "",
    `Max drawdown (unitized): NAV ${cellPct(report.drawdown.nav_max_pct)} (now ${cellPct(report.drawdown.nav_current_pct)}); deployed ${cellPct(report.drawdown.deployed_max_pct)} (now ${cellPct(report.drawdown.deployed_current_pct)}).`,
    "",
  ];

  if (report.windows.length === 0) {
    lines.push("No scored windows yet.", "");
  } else {
    lines.push(
      "| Window | NAV | vs SPY | vs QQQ | Deployed | vs SPY | vs QQQ |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      ...report.windows.map((row) => {
        const cell = (value: number | null) =>
          value == null ? "—" : `${value}%`;
        return `| ${row.label} (${row.start} → ${row.end}) | ${cell(row.nav_return_pct)} | ${cell(row.nav_vs_spy_pct)} | ${cell(row.nav_vs_qqq_pct)} | ${cell(row.deployed_return_pct)} | ${cell(row.deployed_vs_spy_pct)} | ${cell(row.deployed_vs_qqq_pct)} |`;
      }),
      "",
    );
  }

  if (report.notes.length > 0) {
    lines.push("## Notes", "", ...report.notes.map((note) => `- ${note}`), "");
  }

  return lines.join("\n");
}
