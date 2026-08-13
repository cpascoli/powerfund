import { RISK_DEFAULTS } from "@powerfund/domain";

import type { MandateFlag } from "@/lib/data/portfolio";
import { createClient } from "@/lib/supabase/server";

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
): Promise<SnapshotRow[]> {
  const supabase = await createClient();
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
   * Kill-switch measure (mandate rule 8): decline from the peak
   * return-on-cost of deployed capital, in percentage points. Return on
   * cost = (positions market value − invested cost) / invested cost, which
   * stays comparable across deposits and new fills in a way raw NAV cannot.
   */
  deployedDrawdownPp: number | null;
  killSwitchBreached: boolean;
};

function returnOnCost(point: {
  invested: number;
  positionsValue: number;
}): number | null {
  if (point.invested <= 0) return null;
  return ((point.positionsValue - point.invested) / point.invested) * 100;
}

export function computeDrawdown(
  history: SnapshotRow[],
  current: { nav: number; invested: number; positionsValue: number },
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

  const returns = [...history, { asOf: "now", cash: 0, ...current }]
    .map(returnOnCost)
    .filter((value): value is number => value != null);
  const currentReturn = returnOnCost(current);
  const deployedDrawdownPp =
    returns.length > 0 && currentReturn != null
      ? Math.max(...returns) - currentReturn
      : null;

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
      label: `Deployed drawdown ${drawdown.deployedDrawdownPp?.toFixed(1)}% breaches the ${RISK_DEFAULTS.drawdownKillSwitchPct}% kill-switch — halt new risk and review the book`,
    });
  } else if (drawdown.deployedDrawdownPp != null) {
    flags.push({
      code: "drawdown_kill_switch",
      severity: "ok",
      label: `Deployed drawdown ${drawdown.deployedDrawdownPp.toFixed(1)}% vs ${RISK_DEFAULTS.drawdownKillSwitchPct}% kill-switch`,
    });
  }

  return flags;
}
