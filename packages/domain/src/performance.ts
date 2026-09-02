import { fillSessionDate } from "./dates";
import type { TransactionKind } from "./types";

/** Mandate benchmarks. Do not blend these into a policy portfolio. */
export type BenchmarkRole = "success" | "style";

export const BENCHMARKS = {
  success: {
    role: "success",
    symbol: "SPY",
    label: "S&P 500 TR",
    question: "Did the book beat owning the market?",
  },
  style: {
    role: "style",
    symbol: "QQQ",
    label: "Nasdaq-100 TR",
    question: "Did the thematic sleeve earn its growth beta?",
  },
} as const;

export type PerformanceSleeve = "nav" | "deployed";

export type PerformanceWindowId = "inception" | `review-${string}`;

export type PerformanceReview = {
  id: PerformanceWindowId;
  date: string;
  label: string;
};

/** First allocated capital hit the ledger. */
export const INCEPTION_DATE = "2026-08-12";

/**
 * Formal book reviews. "Since review" starts on the last mark on or
 * before the review date. Add a row when a review is written; do not
 * invent windows to make a period look better.
 */
export const PERFORMANCE_REVIEWS: readonly PerformanceReview[] = [
  {
    id: "review-2026-08-15",
    date: "2026-08-15",
    label: "15 Aug 2026 review",
  },
];

export type PerformancePoint = {
  date: string;
  nav: number;
  invested: number;
  positionsValue: number;
  /** Deposits and withdrawals attributed to this mark. */
  externalFlow: number;
  /** Cash deployed into (or returned from) stocks, attributed to this mark. */
  sleeveFlow: number;
};

export type WindowReturn = {
  start: string;
  end: string;
  points: number;
  navReturn: number | null;
  deployedReturn: number | null;
  /** Current unitized NAV drawdown from peak, percent. */
  navDrawdownPct: number | null;
  /** Worst peak-to-trough unitized NAV drawdown in the window, percent. */
  navMaxDrawdownPct: number | null;
  /** Current unitized deployed-sleeve drawdown from peak, percent. */
  deployedDrawdownPct: number | null;
  /** Worst peak-to-trough deployed-sleeve drawdown in the window, percent. */
  deployedMaxDrawdownPct: number | null;
};

function chainTwr(returns: number[]): number | null {
  if (returns.length === 0) return null;
  return returns.reduce((product, value) => product * (1 + value), 1) - 1;
}

export type DailyFlows = {
  external: number;
  sleeve: number;
};

/**
 * Bucket ledger rows by the **session they mark on** (see `fillSessionDate`),
 * not by their UTC calendar day. A fill booked at 16:31 ET is still that
 * session's trade, but it is already the next day in UTC — and bucketing it
 * there puts the flow on a snapshot taken before the position existed, which
 * fabricates a loss on the fill day and a matching gain after it.
 */
export function accumulateLedgerFlows(
  rows: Array<{
    occurredAt: string;
    kind: TransactionKind;
    cashDelta: number;
  }>,
): Map<string, DailyFlows> {
  const bySession = new Map<string, DailyFlows>();
  for (const row of rows) {
    const session = fillSessionDate(row.occurredAt);
    const current = bySession.get(session) ?? { external: 0, sleeve: 0 };
    if (isExternalFlowKind(row.kind)) {
      current.external += row.cashDelta;
    }
    if (isSleeveFlowKind(row.kind)) {
      current.sleeve += -row.cashDelta;
    }
    bySession.set(session, current);
  }
  return bySession;
}

export type PerformanceMark = {
  date: string;
  nav: number;
  invested: number;
  positionsValue: number;
};

/**
 * Attach flows to marks so that no flow is ever dropped and none lands on a
 * mark taken before it.
 *
 * Each mark absorbs every flow in `(previous mark, this mark]`, so a fill on a
 * day with no snapshot (a holiday, a missed nightly run) folds into the next
 * mark rather than vanishing.
 *
 * Set `openEndedFinalMark` when the last mark is the **live book** rather than a
 * stored snapshot: the live book always contains every fill booked so far, so it
 * must also carry their flows. Leave it off for a pure history — a fill booked
 * after the last snapshot has not marked yet, and folding its flow into a mark
 * that predates it is exactly the phantom-loss bug.
 */
export function buildPerformancePoints(
  marks: readonly PerformanceMark[],
  flows: ReadonlyMap<string, DailyFlows>,
  options?: { openEndedFinalMark?: boolean },
): PerformancePoint[] {
  if (marks.length === 0) return [];
  const openEnded = options?.openEndedFinalMark ?? false;
  const dated = [...flows.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  return marks.map((mark, index) => {
    const previous = index === 0 ? null : marks[index - 1]?.date ?? null;
    const isLast = openEnded && index === marks.length - 1;
    let external = 0;
    let sleeve = 0;
    for (const [date, flow] of dated) {
      if (previous != null && date <= previous) continue;
      if (!isLast && date > mark.date) continue;
      external += flow.external;
      sleeve += flow.sleeve;
    }
    return {
      date: mark.date,
      nav: mark.nav,
      invested: mark.invested,
      positionsValue: mark.positionsValue,
      externalFlow: external,
      sleeveFlow: sleeve,
    };
  });
}

function dailyReturn(end: number, start: number, flow: number): number | null {
  const denom = start + flow;
  if (denom <= 0) return null;
  return end / denom - 1;
}

/**
 * Time-weighted NAV return. External flows (deposits / withdrawals) are
 * removed from the denominator so a contribution is not a gain.
 */
export function navPeriodReturn(points: PerformancePoint[]): number | null {
  if (points.length < 2) return null;
  const returns: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (prev == null || curr == null) continue;
    const value = dailyReturn(curr.nav, prev.nav, curr.externalFlow);
    if (value != null) returns.push(value);
  }
  return chainTwr(returns);
}

/**
 * Time-weighted deployed-sleeve return. Buys and sells are sleeve flows
 * so adding a name at the close is not a stock-picking gain.
 */
export function deployedPeriodReturn(
  points: PerformancePoint[],
): number | null {
  if (points.length < 2) return null;
  const returns: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (prev == null || curr == null) continue;
    if (prev.positionsValue <= 0 && curr.sleeveFlow <= 0) continue;
    const value = dailyReturn(
      curr.positionsValue,
      prev.positionsValue,
      curr.sleeveFlow,
    );
    if (value != null) returns.push(value);
  }
  return chainTwr(returns);
}

/**
 * Unitized deployed-sleeve equity curve. Day 0 is 1.0; later days
 * compound the flow-adjusted return so a fill at the close is not a gain
 * and does not create a phantom drawdown.
 */
export function unitizedDeployedIndex(points: PerformancePoint[]): number[] {
  if (points.length === 0) return [];
  const series = [1];
  let value = 1;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (prev == null || curr == null) {
      series.push(value);
      continue;
    }
    if (prev.positionsValue <= 0 && curr.sleeveFlow <= 0) {
      series.push(value);
      continue;
    }
    const daily = dailyReturn(
      curr.positionsValue,
      prev.positionsValue,
      curr.sleeveFlow,
    );
    if (daily != null) value *= 1 + daily;
    series.push(value);
  }
  return series;
}

/**
 * Unitized NAV equity curve. Day 0 is 1.0; deposits and withdrawals are
 * stripped so a contribution is not a gain and not a phantom recovery.
 */
export function unitizedNavIndex(points: PerformancePoint[]): number[] {
  if (points.length === 0) return [];
  const series = [1];
  let value = 1;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (prev == null || curr == null) {
      series.push(value);
      continue;
    }
    const daily = dailyReturn(curr.nav, prev.nav, curr.externalFlow);
    if (daily != null) value *= 1 + daily;
    series.push(value);
  }
  return series;
}

/** Current drawdown from the high-water mark, in percent of the peak. */
export function drawdownFromPeakPct(series: number[]): number | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  if (last == null) return null;
  const peak = Math.max(...series);
  if (peak <= 0) return null;
  return ((peak - last) / peak) * 100;
}

/**
 * Worst peak-to-trough drawdown in the series, in percent of the local peak.
 * Distinct from current drawdown, which only looks at the last point.
 */
export function maxDrawdownPct(series: number[]): number | null {
  if (series.length < 2) return null;
  const first = series[0];
  if (first == null || first <= 0) return null;
  let peak = first;
  let worst = 0;
  for (const value of series) {
    if (value > peak) peak = value;
    if (peak <= 0) continue;
    const drawdown = ((peak - value) / peak) * 100;
    if (drawdown > worst) worst = drawdown;
  }
  return worst;
}

export function indexReturn(
  startLevel: number | null,
  endLevel: number | null,
): number | null {
  if (startLevel == null || endLevel == null || startLevel <= 0) return null;
  return endLevel / startLevel - 1;
}

export function excessReturn(
  fund: number | null,
  benchmark: number | null,
): number | null {
  if (fund == null || benchmark == null) return null;
  return fund - benchmark;
}

export function slicePointsOnOrAfter(
  points: PerformancePoint[],
  startDate: string,
): PerformancePoint[] {
  if (points.length === 0) return [];
  let startIndex = 0;
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (point != null && point.date <= startDate) {
      startIndex = i;
    }
  }
  const start = points[startIndex];
  if (start == null || start.date > startDate) {
    return points;
  }
  return points.slice(startIndex);
}

export function slicePointsInRange(
  points: PerformancePoint[],
  fromDate?: string,
  toDate?: string,
): PerformancePoint[] {
  const sliced = fromDate ? slicePointsOnOrAfter(points, fromDate) : points;
  if (toDate == null) return sliced;
  return sliced.filter((point) => point.date <= toDate);
}

export function windowReturn(
  points: PerformancePoint[],
): WindowReturn | null {
  if (points.length < 2) return null;
  const start = points[0];
  const end = points[points.length - 1];
  if (start == null || end == null) return null;
  const navIndex = unitizedNavIndex(points);
  const deployedIndex = unitizedDeployedIndex(points);
  return {
    start: start.date,
    end: end.date,
    points: points.length,
    navReturn: navPeriodReturn(points),
    deployedReturn: deployedPeriodReturn(points),
    navDrawdownPct: drawdownFromPeakPct(navIndex),
    navMaxDrawdownPct: maxDrawdownPct(navIndex),
    deployedDrawdownPct: drawdownFromPeakPct(deployedIndex),
    deployedMaxDrawdownPct: maxDrawdownPct(deployedIndex),
  };
}

export function isExternalFlowKind(kind: TransactionKind): boolean {
  switch (kind) {
    case "deposit":
    case "withdrawal":
    case "adjustment":
      return true;
    case "buy":
    case "sell":
    case "dividend":
    case "interest":
    case "fee":
      return false;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function isSleeveFlowKind(kind: TransactionKind): boolean {
  switch (kind) {
    case "buy":
    case "sell":
      return true;
    case "deposit":
    case "withdrawal":
    case "dividend":
    case "interest":
    case "fee":
    case "adjustment":
      return false;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
