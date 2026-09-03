/**
 * Detecting when a vendor has re-based a price series.
 *
 * A split does not arrive as an event we can subscribe to. It arrives as the
 * vendor quietly returning different numbers for sessions we already stored:
 * Amphenol split two-for-one on 26 August 2026 and our series ended up holding
 * $163.18 for 1 September while the vendor had moved to $81.59 — exactly twice,
 * on every overlapping session.
 *
 * Nothing caught it, because the nightly job only refreshes the last few days
 * and upserts them without ever comparing. The stored series became a mix of
 * pre- and post-split prices with `adj_close = close` on both sides, so no
 * column said which basis a row was in. Returns spanning the boundary were
 * fabricated, and had the name been held its mark — and therefore NAV, the
 * deployed drawdown and the kill-switch — would have been out by the split
 * factor while the ledger reconciled perfectly.
 *
 * So the check is: whenever we refetch a window, do the sessions we already
 * hold still agree with the vendor?
 */

export type StoredClose = { date: string; close: number };

export type PriceRebase = {
  /** The vendor disagrees about sessions we already stored. */
  rebased: boolean;
  comparedSessions: number;
  disagreeingSessions: number;
  /**
   * Median stored ÷ fetched across disagreeing sessions. A clean split shows a
   * simple ratio (2, 0.5, 10) repeated on every session; a one-off vendor
   * correction does not.
   */
  ratio: number | null;
  /** True when every disagreeing session shares the same ratio — a split. */
  consistent: boolean;
  /** Earliest session where the two disagree. */
  firstDisagreement: string | null;
};

/** Vendors revise the last decimal; a split moves the price by a factor. */
const DEFAULT_TOLERANCE_PCT = 0.5;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const low = sorted[mid - 1];
  const high = sorted[mid];
  return low == null || high == null ? null : (low + high) / 2;
}

export function detectPriceRebase(
  stored: readonly StoredClose[],
  fetched: readonly StoredClose[],
  options?: { tolerancePct?: number },
): PriceRebase {
  const tolerance = (options?.tolerancePct ?? DEFAULT_TOLERANCE_PCT) / 100;
  const byDate = new Map(stored.map((row) => [row.date, row.close]));

  let compared = 0;
  const ratios: number[] = [];
  let firstDisagreement: string | null = null;

  for (const bar of fetched) {
    const held = byDate.get(bar.date);
    if (held == null || bar.close <= 0 || held <= 0) continue;
    compared += 1;
    const ratio = held / bar.close;
    if (Math.abs(ratio - 1) <= tolerance) continue;
    ratios.push(ratio);
    if (firstDisagreement == null || bar.date < firstDisagreement) {
      firstDisagreement = bar.date;
    }
  }

  const ratio = median(ratios);
  // Every disagreeing session moving by the same factor is the split signature.
  const consistent =
    ratio != null &&
    ratios.length > 1 &&
    ratios.every((value) => Math.abs(value / ratio - 1) <= tolerance);

  return {
    rebased: ratios.length > 0,
    comparedSessions: compared,
    disagreeingSessions: ratios.length,
    ratio,
    consistent,
    firstDisagreement,
  };
}

/** One line for an ingest log. */
export function describePriceRebase(rebase: PriceRebase): string {
  if (!rebase.rebased) return "series agrees with the vendor";
  const factor = rebase.ratio == null ? "?" : rebase.ratio.toFixed(4);
  const shape = rebase.consistent
    ? `consistent ${factor}x — looks like a split`
    : `inconsistent (median ${factor}x) — vendor revision`;
  return (
    `${rebase.disagreeingSessions}/${rebase.comparedSessions} stored sessions ` +
    `disagree from ${rebase.firstDisagreement}; ${shape}`
  );
}

/**
 * A jump inside our own stored series, used to find damage a refresh window can
 * no longer reach. A real session rarely moves a large-cap by half; a split
 * always does.
 */
export type SeriesDiscontinuity = {
  date: string;
  previousClose: number;
  close: number;
  changePct: number;
};

export function findSeriesDiscontinuities(
  closes: readonly StoredClose[],
  options?: { thresholdPct?: number },
): SeriesDiscontinuity[] {
  const threshold = (options?.thresholdPct ?? 35) / 100;
  const out: SeriesDiscontinuity[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const previous = closes[i - 1];
    const current = closes[i];
    if (previous == null || current == null || previous.close <= 0) continue;
    const change = current.close / previous.close - 1;
    if (Math.abs(change) < threshold) continue;
    out.push({
      date: current.date,
      previousClose: previous.close,
      close: current.close,
      changePct: change * 100,
    });
  }
  return out;
}
