import type { InflectionSetup } from "./inflection";

/**
 * Grading a scorer's setups against forward returns.
 *
 * The raw return of a setup says almost nothing on its own: over 2021–2026 this
 * universe rose so far that every state shows a large positive number. What
 * matters is the return relative to simply holding the universe on the same
 * date, which is why every stat carries an excess alongside it.
 */

export type ReplayObservation = {
  symbol: string;
  date: string;
  setup: InflectionSetup;
  /** Forward return by horizon label; null when the window has not elapsed. */
  forward: ReadonlyMap<string, number | null>;
};

export type ReplayHorizon = { label: string; sessions: number };

export type HorizonStats = {
  label: string;
  graded: number;
  meanReturn: number | null;
  medianReturn: number | null;
  meanExcess: number | null;
  hitRate: number | null;
};

export type SetupStats = {
  setup: InflectionSetup;
  observations: number;
  byHorizon: HorizonStats[];
};

export type ReplayAggregate = {
  stats: SetupStats[];
  /** Observations forming the per-date baseline. */
  baselineObservations: number;
  /** Observations excluded from the baseline because the scorer could not score them. */
  excludedFromBaseline: number;
};

/**
 * States that mean "the scorer had nothing to work with", not "the scorer has a
 * view". They must not sit in the baseline: the names that land here are the
 * ones with no quarterly disclosure — recent listings and foreign issuers —
 * which over this window were the strongest performers in the universe. Leaving
 * them in makes the average they are compared against their own return, and
 * every genuine setup looks worse than it is.
 */
const UNSCOREABLE: ReadonlySet<InflectionSetup> = new Set<InflectionSetup>([
  "insufficient_data",
]);

export function isScoreableSetup(setup: InflectionSetup): boolean {
  return !UNSCOREABLE.has(setup);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const low = sorted[mid - 1];
  const high = sorted[mid];
  return low == null || high == null ? null : (low + high) / 2;
}

export function aggregateReplay(
  observations: readonly ReplayObservation[],
  horizons: readonly ReplayHorizon[],
): ReplayAggregate {
  const baseline = observations.filter((row) => isScoreableSetup(row.setup));

  // Sum and count of every *scoreable* name's forward return on each date, so a
  // name can be compared against its peers leave-one-out rather than against an
  // average that includes itself.
  const byDate = new Map<string, Map<string, { sum: number; count: number }>>();
  for (const row of baseline) {
    const forHorizon =
      byDate.get(row.date) ?? new Map<string, { sum: number; count: number }>();
    for (const horizon of horizons) {
      const value = row.forward.get(horizon.label);
      if (value == null) continue;
      const acc = forHorizon.get(horizon.label) ?? { sum: 0, count: 0 };
      acc.sum += value;
      acc.count += 1;
      forHorizon.set(horizon.label, acc);
    }
    byDate.set(row.date, forHorizon);
  }

  const bySetup = new Map<InflectionSetup, ReplayObservation[]>();
  for (const row of observations) {
    const list = bySetup.get(row.setup) ?? [];
    list.push(row);
    bySetup.set(row.setup, list);
  }

  const stats: SetupStats[] = [...bySetup.entries()]
    .map(([setup, rows]) => ({
      setup,
      observations: rows.length,
      byHorizon: horizons.map((horizon) => {
        const returns: number[] = [];
        const excess: number[] = [];
        const inBaseline = isScoreableSetup(setup);
        for (const row of rows) {
          const value = row.forward.get(horizon.label);
          if (value == null) continue;
          returns.push(value);
          const acc = byDate.get(row.date)?.get(horizon.label);
          if (acc == null) continue;
          // Leave-one-out: a scoreable name is part of the baseline, so remove
          // its own contribution before comparing against it.
          const sum = inBaseline ? acc.sum - value : acc.sum;
          const count = inBaseline ? acc.count - 1 : acc.count;
          if (count > 0) excess.push(value - sum / count);
        }
        return {
          label: horizon.label,
          graded: returns.length,
          meanReturn: mean(returns),
          medianReturn: median(returns),
          meanExcess: mean(excess),
          hitRate:
            returns.length === 0
              ? null
              : returns.filter((value) => value > 0).length / returns.length,
        };
      }),
    }))
    .sort((a, b) => b.observations - a.observations);

  return {
    stats,
    baselineObservations: baseline.length,
    excludedFromBaseline: observations.length - baseline.length,
  };
}
