import {
  RISK_DEFAULTS,
  accumulateLedgerFlows,
  drawdownFromPeakPct,
  unitizedDeployedIndex,
  utcDay,
  type DailyFlows,
  type PerformancePoint,
} from "@powerfund/domain";
import type { Database } from "@powerfund/db";

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
  killSwitchBreached: boolean;
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

function toPoint(
  date: string,
  nav: number,
  invested: number,
  positionsValue: number,
  flows: Map<string, DailyFlows>,
): PerformancePoint {
  const flow = flows.get(date) ?? { external: 0, sleeve: 0 };
  return {
    date,
    nav,
    invested,
    positionsValue,
    externalFlow: flow.external,
    sleeveFlow: flow.sleeve,
  };
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
    };
  }

  const peakNav = Math.max(...history.map((row) => row.nav), current.nav);
  const navDrawdownPct =
    peakNav > 0 ? ((peakNav - current.nav) / peakNav) * 100 : null;

  const points: PerformancePoint[] = history.map((row) =>
    toPoint(
      utcDay(row.asOf),
      row.nav,
      row.invested,
      row.positionsValue,
      flows,
    ),
  );
  const liveDate = utcDay(current.asOf ?? new Date().toISOString());
  const livePoint = toPoint(
    liveDate,
    current.nav,
    current.invested,
    current.positionsValue,
    flows,
  );
  const last = points.at(-1);
  if (last == null || last.date < liveDate) {
    points.push(livePoint);
  } else if (last.date === liveDate) {
    points[points.length - 1] = livePoint;
  }

  const deployedDrawdownPp = drawdownFromPeakPct(
    unitizedDeployedIndex(points),
  );

  return {
    snapshots: history.length,
    peakNav,
    navDrawdownPct,
    deployedDrawdownPp,
    killSwitchBreached:
      deployedDrawdownPp != null &&
      deployedDrawdownPp >= RISK_DEFAULTS.drawdownKillSwitchPct,
  };
}

/**
 * Snapshot-derived mandate flags: the rule-8 kill-switch and a freshness
 * check on the nightly job. Rendered alongside the book flags on both the
 * Briefing and the Portfolio mandate tab.
 */
export function snapshotFlags(
  history: SnapshotRow[],
  drawdown: DrawdownSummary,
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
    flags.push({
      code: "drawdown_kill_switch",
      severity: "warn",
      label: `Unitized deployed drawdown ${drawdown.deployedDrawdownPp?.toFixed(1)}% breaches the ${RISK_DEFAULTS.drawdownKillSwitchPct}% kill-switch — halt new risk and review the book`,
    });
  } else if (drawdown.deployedDrawdownPp != null) {
    flags.push({
      code: "drawdown_kill_switch",
      severity: "ok",
      label: `Unitized deployed drawdown ${drawdown.deployedDrawdownPp.toFixed(1)}% vs ${RISK_DEFAULTS.drawdownKillSwitchPct}% kill-switch`,
    });
  }

  return flags;
}
