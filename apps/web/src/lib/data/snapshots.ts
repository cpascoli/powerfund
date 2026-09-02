import {
  RISK_DEFAULTS,
  accumulateLedgerFlows,
  buildPerformancePoints,
  drawdownFromPeakPct,
  shouldHaltNewRiskForKillSwitch,
  unitizedDeployedIndex,
  utcDay,
  type DailyFlows,
  type PerformanceMark,
  type PerformancePoint,
} from "@powerfund/domain";
import type { Database } from "@powerfund/db";

import {
  resolveDrawdownDiagnostic,
  type DrawdownDiagnosticState,
  type SleeveDiagnosticRecord,
} from "@/lib/data/drawdown-diagnostic";
import type { MandateFlag } from "@/lib/data/portfolio";
import { resolveDb, type DbClient } from "@/lib/supabase/db";

type TransactionKind = Database["public"]["Enums"]["transaction_kind"];

export type SnapshotRow = {
  asOf: string;
  nav: number;
  cash: number;
  invested: number;
  positionsValue: number;
};

type SnapshotDbRow = {
  as_of: string;
  nav: number;
  cash: number;
  invested: number;
  positions_value: number;
};

export async function listPortfolioSnapshots(
  limit = 365,
  client?: DbClient,
): Promise<SnapshotRow[]> {
  const supabase = await resolveDb(client);
  const { data, error } = await supabase
    .from("portfolio_snapshots")
    .select("as_of, nav, cash, invested, positions_value")
    .order("as_of", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load snapshots: ${error.message}`);
  }

  return (((data as SnapshotDbRow[] | null) ?? []) as SnapshotDbRow[])
    .map((row) => ({
      asOf: row.as_of,
      nav: Number(row.nav),
      cash: Number(row.cash),
      invested: Number(row.invested),
      positionsValue: Number(row.positions_value),
    }))
    .reverse();
}

export type DrawdownSummary = {
  /** History points used (excluding the live mark). */
  snapshots: number;
  peakNav: number | null;
  navDrawdownPct: number | null;
  /**
   * Kill-switch measure (mandate rule 8): drawdown from the peak of the
   * unitized deployed-sleeve curve. New fills are sleeve flows, so adding
   * at cost cannot manufacture a drawdown.
   */
  deployedDrawdownPp: number | null;
  /** True when deployed drawdown is at or above the 15% diagnostic. */
  killSwitchBreached: boolean;
  /** True only after Phase 1 — the buy gate uses this, not the diagnostic alone. */
  killSwitchBlocksNewRisk: boolean;
  investedCostUsd: number;
};

export async function listLedgerFlows(
  client?: DbClient,
): Promise<Map<string, DailyFlows>> {
  const supabase = await resolveDb(client);
  const { data, error } = await supabase
    .from("transactions")
    .select("occurred_at, kind, cash_delta");
  if (error) {
    throw new Error(`Failed to load ledger flows: ${error.message}`);
  }
  return accumulateLedgerFlows(
    ((data as Array<{
      occurred_at: string;
      kind: TransactionKind;
      cash_delta: number;
    }> | null) ?? []).map((row) => ({
      occurredAt: row.occurred_at,
      kind: row.kind,
      cashDelta: Number(row.cash_delta),
    })),
  );
}

/**
 * EOD marks plus the live book as the final point.
 *
 * The live mark is keyed on the session it belongs to, not the UTC calendar
 * day: before the close it is still the previous session's row that it replaces,
 * and `buildPerformancePoints` then folds every flow since the last snapshot
 * into it. Keying the live point on the UTC day while flows key on the session
 * is what produced the phantom fill-day loss.
 */
function livePerformancePoints(
  history: SnapshotRow[],
  current: {
    nav: number;
    invested: number;
    positionsValue: number;
    asOf?: string;
  },
  flows: Map<string, DailyFlows>,
): PerformancePoint[] {
  const marks: PerformanceMark[] = history.map((row) => ({
    date: utcDay(row.asOf),
    nav: row.nav,
    invested: row.invested,
    positionsValue: row.positionsValue,
  }));
  const liveDate = utcDay(current.asOf ?? new Date().toISOString());
  const liveMark: PerformanceMark = {
    date: liveDate,
    nav: current.nav,
    invested: current.invested,
    positionsValue: current.positionsValue,
  };
  const last = marks.at(-1);
  if (last == null || last.date < liveDate) {
    marks.push(liveMark);
  } else {
    // The live book supersedes any mark stamped on or after it.
    marks[marks.length - 1] = { ...liveMark, date: last.date };
  }
  return buildPerformancePoints(marks, flows, { openEndedFinalMark: true });
}

export function computeDrawdown(
  history: SnapshotRow[],
  current: {
    nav: number;
    invested: number;
    positionsValue: number;
    asOf?: string;
  },
  flows: Map<string, DailyFlows> = new Map(),
): DrawdownSummary {
  if (history.length === 0) {
    return {
      snapshots: 0,
      peakNav: null,
      navDrawdownPct: null,
      deployedDrawdownPp: null,
      killSwitchBreached: false,
      killSwitchBlocksNewRisk: false,
      investedCostUsd: current.invested,
    };
  }

  const peakNav = Math.max(...history.map((row) => row.nav), current.nav);
  const navDrawdownPct =
    peakNav > 0 ? ((peakNav - current.nav) / peakNav) * 100 : null;
  const points = livePerformancePoints(history, current, flows);
  const deployedDrawdownPp = drawdownFromPeakPct(
    unitizedDeployedIndex(points),
  );
  const killSwitchBreached =
    deployedDrawdownPp != null &&
    deployedDrawdownPp >= RISK_DEFAULTS.drawdownKillSwitchPct;

  return {
    snapshots: history.length,
    peakNav,
    navDrawdownPct,
    deployedDrawdownPp,
    killSwitchBreached,
    killSwitchBlocksNewRisk: shouldHaltNewRiskForKillSwitch(
      killSwitchBreached,
      current.invested,
    ),
    investedCostUsd: current.invested,
  };
}

/** Running unitized deployed drawdown on each history day plus the live mark. */
export function deployedDrawdownSeries(
  history: SnapshotRow[],
  current: {
    nav: number;
    invested: number;
    positionsValue: number;
    asOf?: string;
  },
  flows: Map<string, DailyFlows> = new Map(),
): Array<{ date: string; pct: number | null }> {
  if (history.length === 0) return [];
  const points = livePerformancePoints(history, current, flows);
  const index = unitizedDeployedIndex(points);
  let peak = -Infinity;
  return points.map((point, i) => {
    const value = index[i];
    if (value == null) return { date: point.date, pct: null };
    if (value > peak) peak = value;
    const pct = peak > 0 ? ((peak - value) / peak) * 100 : 0;
    return { date: point.date, pct };
  });
}

/**
 * Snapshot-derived mandate flags: the rule-8 drawdown diagnostic and a
 * freshness check on the nightly job. Rendered alongside the book flags
 * on both the Briefing and the Portfolio mandate tab.
 *
 * The 15% sleeve print is always the live condition. `diagnostic` decides
 * whether Briefing Due still owes a ritual-11 write (`due: true`) or the
 * condition is only being monitored (`due: false`).
 */
export function snapshotFlags(
  history: SnapshotRow[],
  drawdown: DrawdownSummary,
  diagnostic?: DrawdownDiagnosticState,
): MandateFlag[] {
  const flags: MandateFlag[] = [];

  const latest = history.at(-1);
  if (latest == null) {
    flags.push({
      code: "snapshot_stale",
      severity: "warn",
      label:
        "No NAV snapshots yet — drawdown and the kill-switch are blind until the nightly job runs",
    });
  } else {
    const ageDays = Math.floor(
      (Date.now() - new Date(latest.asOf).getTime()) / 86_400_000,
    );
    // > 3 calendar days tolerates weekends; anything older means the
    // 22:30 UTC weekday job has been failing silently.
    if (ageDays > 3) {
      flags.push({
        code: "snapshot_stale",
        severity: "warn",
        label: `Last NAV snapshot is ${ageDays} days old — check the scheduled snapshot function`,
      });
    }
  }

  if (drawdown.killSwitchBreached) {
    const monitoring = diagnostic?.status === "monitoring";
    flags.push({
      code: "drawdown_kill_switch",
      severity: "warn",
      due: !monitoring,
      label: killSwitchFlagLabel(drawdown, diagnostic),
    });
  } else if (drawdown.deployedDrawdownPp != null) {
    flags.push({
      code: "drawdown_kill_switch",
      severity: "ok",
      due: false,
      label: `Unitized deployed drawdown ${drawdown.deployedDrawdownPp.toFixed(1)}% vs ${RISK_DEFAULTS.drawdownKillSwitchPct}% diagnostic`,
    });
  }

  return flags;
}

function killSwitchFlagLabel(
  drawdown: DrawdownSummary,
  diagnostic: DrawdownDiagnosticState | undefined,
): string {
  const pct = drawdown.deployedDrawdownPp?.toFixed(1);
  if (diagnostic?.status === "monitoring") {
    return drawdown.killSwitchBlocksNewRisk
      ? `Unitized deployed drawdown ${pct}% — diagnostic completed; new buys still need an override`
      : `Unitized deployed drawdown ${pct}% — diagnostic completed; monitoring`;
  }
  return drawdown.killSwitchBlocksNewRisk
    ? `Unitized deployed drawdown ${pct}% breaches the ${RISK_DEFAULTS.drawdownKillSwitchPct}% diagnostic after Phase 1 — halt new risk and review the book`
    : `Unitized deployed drawdown ${pct}% — mandatory diagnostic (Phase 1: does not halt new buys)`;
}

export function snapshotFlagsForDrawdown(
  history: SnapshotRow[],
  drawdown: DrawdownSummary,
  current: {
    nav: number;
    invested: number;
    positionsValue: number;
    asOf?: string;
  },
  flows: Map<string, DailyFlows>,
  records: SleeveDiagnosticRecord[],
  now?: Date,
): MandateFlag[] {
  const diagnostic = resolveDrawdownDiagnostic({
    breached: drawdown.killSwitchBreached,
    currentPct: drawdown.deployedDrawdownPp,
    daily: deployedDrawdownSeries(history, current, flows),
    records,
    now,
  });
  return snapshotFlags(history, drawdown, diagnostic);
}

export function mergeBookAndSnapshotFlags(
  bookFlags: MandateFlag[],
  history: SnapshotRow[],
  current: {
    nav: number;
    invested: number;
    positionsValue: number;
    asOf?: string;
  },
  flows: Map<string, DailyFlows> = new Map(),
  records: SleeveDiagnosticRecord[] = [],
  now?: Date,
): MandateFlag[] {
  const drawdown = computeDrawdown(history, current, flows);
  return [
    ...snapshotFlagsForDrawdown(
      history,
      drawdown,
      current,
      flows,
      records,
      now,
    ),
    ...bookFlags,
  ];
}
