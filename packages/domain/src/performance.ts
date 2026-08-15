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
  /** Deposits and withdrawals posted that UTC day. */
  externalFlow: number;
  /** Cash deployed into (or returned from) stocks that UTC day. */
  sleeveFlow: number;
};

export type WindowReturn = {
  start: string;
  end: string;
  points: number;
  navReturn: number | null;
  deployedReturn: number | null;
};

function chainTwr(returns: number[]): number | null {
  if (returns.length === 0) return null;
  return returns.reduce((product, value) => product * (1 + value), 1) - 1;
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

export function windowReturn(
  points: PerformancePoint[],
): WindowReturn | null {
  if (points.length < 2) return null;
  const start = points[0];
  const end = points[points.length - 1];
  if (start == null || end == null) return null;
  return {
    start: start.date,
    end: end.date,
    points: points.length,
    navReturn: navPeriodReturn(points),
    deployedReturn: deployedPeriodReturn(points),
  };
}

export function isExternalFlowKind(
  kind: "deposit" | "withdrawal" | "buy" | "sell" | "dividend" | "interest" | "fee" | "adjustment",
): boolean {
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

export function isSleeveFlowKind(
  kind: "deposit" | "withdrawal" | "buy" | "sell" | "dividend" | "interest" | "fee" | "adjustment",
): boolean {
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
