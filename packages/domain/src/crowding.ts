export type CrowdingBand = "calm" | "extended" | "crowded";

export type CrowdingSnapshot = {
  lastClose: number;
  bars: number;
  /** 0–100 percentile of last close vs the series (split-adjusted). */
  pricePercentile: number | null;
  sma200: number | null;
  /** Percent extension of last close above/below the 200-day SMA. */
  extensionPct: number | null;
  band: CrowdingBand;
};

function sma(values: number[], window: number): number | null {
  if (values.length < window) return null;
  const slice = values.slice(-window);
  const sum = slice.reduce((total, value) => total + value, 0);
  return sum / window;
}

/**
 * Share of observations in `values` that are ≤ `last`. 50 = median of the
 * window; 100 = a new high. Used as a price-history stand-in for "valuation
 * percentile vs the name's own 5-year history" until multiples are ingested.
 */
export function percentileOfLast(values: number[], last: number): number | null {
  if (values.length === 0) return null;
  let atOrBelow = 0;
  for (const value of values) {
    if (value <= last) atOrBelow += 1;
  }
  return (atOrBelow / values.length) * 100;
}

export function crowdingBand(
  pricePercentile: number | null,
  extensionPct: number | null,
): CrowdingBand {
  const percentile = pricePercentile ?? 0;
  const extension = extensionPct ?? 0;
  if (percentile >= 90 && extension >= 15) return "crowded";
  if (percentile >= 80 || extension >= 10) return "extended";
  return "calm";
}

export function computeCrowding(closes: number[]): CrowdingSnapshot | null {
  if (closes.length === 0) return null;
  const lastClose = closes[closes.length - 1]!;
  const sma200 = sma(closes, 200);
  const extensionPct =
    sma200 != null && sma200 !== 0
      ? ((lastClose - sma200) / sma200) * 100
      : null;
  const pricePercentile = percentileOfLast(closes, lastClose);
  return {
    lastClose,
    bars: closes.length,
    pricePercentile,
    sma200,
    extensionPct,
    band: crowdingBand(pricePercentile, extensionPct),
  };
}
