/**
 * Point-in-time fundamentals.
 *
 * `fundamentals_quarterly` keyed a quarter on `(instrument_id, period_end)` and
 * upserted, so a restatement destroyed the original and there was no way to ask
 * "what did we know on date D". Any scorer built on that is look-ahead biased by
 * construction, and any backtest of it is unfalsifiable — you cannot tell a real
 * signal from a bug, which is the whole point of the exercise.
 *
 * `fundamentals_vintages` is append-only: one row per distinct observation of a
 * quarter. `fundamentals_quarterly` stays as the latest-known projection so
 * existing read paths are unchanged, in the same shape as the transactions
 * ledger and its position projection.
 */

/**
 * Filing lag assumed when a vendor gives us numbers but no filing date (Yahoo
 * does not publish one).
 *
 * Deliberately late rather than accurate. Assuming we learned something *later*
 * than we did makes a backtest understate the strategy; assuming *earlier*
 * reintroduces exactly the look-ahead this table exists to remove. A signal that
 * only works when fundamentals arrive on the optimistic estimate is not a signal.
 * Estimated vintages are flagged so a strict backtest can drop them outright.
 */
export const ESTIMATED_FILING_LAG_DAYS = 90;

export type KnowableBasis = "filing" | "estimated";

export type VintageKey = {
  periodEnd: string;
  /** Earliest date this observation could have been known. */
  knowableAt: string;
  /** When we ingested it. Breaks ties between same-day observations. */
  observedAt: string;
};

export function addDays(date: string, days: number): string {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed)) return date;
  return new Date(parsed + days * 86_400_000).toISOString().slice(0, 10);
}

/** Conservative stand-in for an unknown filing date. */
export function estimatedKnowableAt(periodEnd: string): string {
  return addDays(periodEnd, ESTIMATED_FILING_LAG_DAYS);
}

/**
 * When a quarter became knowable, and whether that is a fact or an assumption.
 * A filing date before the period it reports on is not believable, so it is
 * treated as missing.
 */
export function resolveKnowableAt(
  periodEnd: string,
  filedAt: string | null | undefined,
): { knowableAt: string; basis: KnowableBasis } {
  const filed = filedAt?.trim();
  if (filed && filed >= periodEnd) {
    return { knowableAt: filed, basis: "filing" };
  }
  return { knowableAt: estimatedKnowableAt(periodEnd), basis: "estimated" };
}

/**
 * The information set as of `asOf`: for each period, the newest observation that
 * was already knowable then. A restatement filed after `asOf` is invisible,
 * which is the property that makes a backtest falsifiable.
 */
export function latestVintagesAsOf<T extends VintageKey>(
  rows: readonly T[],
  asOf: string,
): T[] {
  const best = new Map<string, T>();
  for (const row of rows) {
    if (row.knowableAt > asOf) continue;
    const current = best.get(row.periodEnd);
    if (current == null || supersedes(row, current)) {
      best.set(row.periodEnd, row);
    }
  }
  return [...best.values()].sort((a, b) =>
    a.periodEnd < b.periodEnd ? -1 : a.periodEnd > b.periodEnd ? 1 : 0,
  );
}

function supersedes(next: VintageKey, prev: VintageKey): boolean {
  if (next.knowableAt !== prev.knowableAt) {
    return next.knowableAt > prev.knowableAt;
  }
  return next.observedAt > prev.observedAt;
}

/** Current best knowledge — every vintage, no as-of cut. */
export function latestVintages<T extends VintageKey>(rows: readonly T[]): T[] {
  return latestVintagesAsOf(rows, "9999-12-31");
}
