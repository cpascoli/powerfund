import { utcDay, type DailyFlows } from "@powerfund/domain";

import type { SnapshotRow } from "./snapshots";

export const NAV_CHART_VIEWS = ["nav", "change", "pnl"] as const;

export type NavChartView = (typeof NAV_CHART_VIEWS)[number];

export type NavChartPoint = {
  date: string;
  nav: number;
  cash: number;
  invested: number;
  positionsValue: number;
  /** Dollar P&L that session: ΔNAV minus deposits/withdrawals. */
  dailyPnl: number | null;
  /** Time-weighted session return (fraction, not percent). */
  dailyReturn: number | null;
  /** Running sum of dailyPnl from the first mark. */
  cumulativePnl: number | null;
  /** True when this point is a live/delayed last sale, not an EOD snapshot. */
  live?: boolean;
};

export function isNavChartView(value: string | undefined): value is NavChartView {
  return (NAV_CHART_VIEWS as readonly string[]).includes(value ?? "");
}

/**
 * EOD snapshot series for the portfolio charts. A deposit is not a gain:
 * daily P&L and the TWR day strip the UTC-day external flow.
 */
export function buildNavChartSeries(
  snapshots: SnapshotRow[],
  flows: Map<string, DailyFlows> = new Map(),
): NavChartPoint[] {
  let cumulativePnl = 0;
  return snapshots.map((row, index) => {
    const date = utcDay(row.asOf);
    const prev = snapshots[index - 1];
    if (prev == null) {
      return {
        date,
        nav: row.nav,
        cash: row.cash,
        invested: row.invested,
        positionsValue: row.positionsValue,
        dailyPnl: null,
        dailyReturn: null,
        cumulativePnl: 0,
      };
    }

    const flow = flows.get(date)?.external ?? 0;
    const dailyPnl = row.nav - prev.nav - flow;
    const denom = prev.nav + flow;
    const dailyReturn = denom > 0 ? row.nav / denom - 1 : null;
    cumulativePnl += dailyPnl;

    return {
      date,
      nav: row.nav,
      cash: row.cash,
      invested: row.invested,
      positionsValue: row.positionsValue,
      dailyPnl,
      dailyReturn,
      cumulativePnl,
    };
  });
}

/**
 * Paint the current book as today's chart point. Replaces a same-day EOD
 * snapshot when the nightly job has already run. Does not persist.
 */
export function appendLiveChartPoint(
  points: NavChartPoint[],
  live: {
    asOf: string | null;
    nav: number;
    cash: number;
    invested: number;
    positionsValue: number;
    dayPnl: number | null;
  },
  flows: Map<string, DailyFlows> = new Map(),
): NavChartPoint[] {
  const date = utcDay(live.asOf ?? new Date().toISOString());
  const last = points.at(-1);
  if (last != null && last.date > date) return points;

  const prior = last != null && last.date === date ? points.at(-2) : last;
  const flow = flows.get(date)?.external ?? 0;
  const dailyPnl =
    live.dayPnl ??
    (prior == null ? null : live.nav - prior.nav - flow);
  const denom = prior == null ? null : prior.nav + flow;
  const dailyReturn =
    denom != null && denom > 0 ? live.nav / denom - 1 : null;
  const cumulativePnl = (prior?.cumulativePnl ?? 0) + (dailyPnl ?? 0);
  const next: NavChartPoint = {
    date,
    nav: live.nav,
    cash: live.cash,
    invested: live.invested,
    positionsValue: live.positionsValue,
    dailyPnl,
    dailyReturn,
    cumulativePnl,
    live: true,
  };

  if (last != null && last.date === date) {
    if (
      last.nav === next.nav &&
      last.dailyPnl === next.dailyPnl &&
      last.live === true
    ) {
      return points;
    }
    return [...points.slice(0, -1), next];
  }

  return [...points, next];
}
