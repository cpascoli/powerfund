export type PricePoint = {
  date: string; // YYYY-MM-DD
  close: number;
};

export type ReturnWindow =
  | "1d"
  | "1w"
  | "1m"
  | "3m"
  | "6m"
  | "ytd"
  | "1y"
  | "2y";

export type PriceReturn = {
  key: ReturnWindow;
  label: string;
  pct: number | null;
};

export const RETURN_WINDOWS: Array<{ key: ReturnWindow; label: string }> = [
  { key: "1d", label: "1D" },
  { key: "1w", label: "1W" },
  { key: "1m", label: "1M" },
  { key: "3m", label: "3M" },
  { key: "6m", label: "6M" },
  { key: "ytd", label: "YTD" },
  { key: "1y", label: "1Y" },
  { key: "2y", label: "2Y" },
];

const WINDOWS = RETURN_WINDOWS;

function parseUtcDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addCalendarDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addCalendarMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

/** Closest bar on or before targetDate; null if none. */
function closeOnOrBefore(
  points: PricePoint[],
  targetDate: string,
): number | null {
  let lo = 0;
  let hi = points.length - 1;
  let best: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const point = points[mid]!;
    if (point.date <= targetDate) {
      best = point.close;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

function pctChange(from: number | null, to: number | null): number | null {
  if (from == null || to == null || from === 0) return null;
  return ((to - from) / from) * 100;
}

export function computePriceReturns(points: PricePoint[]): PriceReturn[] {
  if (points.length === 0) {
    return WINDOWS.map((window) => ({ ...window, pct: null }));
  }

  const last = points[points.length - 1]!;
  const lastClose = last.close;
  const lastDate = parseUtcDate(last.date);

  const anchorFor = (key: ReturnWindow): number | null => {
    switch (key) {
      case "1d": {
        if (points.length < 2) return null;
        return points[points.length - 2]!.close;
      }
      case "1w":
        // 7 calendar days, last bar on or before — the usual "1-week"
        // lookback (~5 sessions), not week-to-date.
        return closeOnOrBefore(
          points,
          formatUtcDate(addCalendarDays(lastDate, -7)),
        );
      case "1m":
        return closeOnOrBefore(
          points,
          formatUtcDate(addCalendarMonths(lastDate, -1)),
        );
      case "3m":
        return closeOnOrBefore(
          points,
          formatUtcDate(addCalendarMonths(lastDate, -3)),
        );
      case "6m":
        return closeOnOrBefore(
          points,
          formatUtcDate(addCalendarMonths(lastDate, -6)),
        );
      case "ytd": {
        const ytd = `${lastDate.getUTCFullYear()}-01-01`;
        return closeOnOrBefore(points, ytd);
      }
      case "1y":
        return closeOnOrBefore(
          points,
          formatUtcDate(addCalendarMonths(lastDate, -12)),
        );
      case "2y":
        return closeOnOrBefore(
          points,
          formatUtcDate(addCalendarMonths(lastDate, -24)),
        );
      default: {
        const _exhaustive: never = key;
        return _exhaustive;
      }
    }
  };

  return WINDOWS.map((window) => ({
    ...window,
    pct: pctChange(anchorFor(window.key), lastClose),
  }));
}

export function computeReturnPct(
  points: PricePoint[],
  window: ReturnWindow,
): number | null {
  return computePriceReturns(points).find((row) => row.key === window)?.pct ?? null;
}

export function isReturnWindow(value: string): value is ReturnWindow {
  return RETURN_WINDOWS.some((window) => window.key === value);
}
