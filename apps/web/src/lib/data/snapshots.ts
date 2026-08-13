import { RISK_DEFAULTS } from "@powerfund/domain";

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
