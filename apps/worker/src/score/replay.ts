import {
  INFLECTION_SCORER_KEY,
  forwardReturn,
  inflectionHysteresisFrom,
  inflectionSetupLabel,
  scoreInflection,
  sliceScorerInputsAsOf,
  type InflectionHysteresis,
  type InflectionSetup,
  type InstrumentHistory,
} from "@powerfund/domain";

import { createAdminDb, listWatchInstruments } from "../db";
import { loadInstrumentHistory, loadSessionCalendar } from "./history";

/**
 * Replay the scorer over history and grade what its setups were worth.
 *
 * This is only honest because fundamentals are now vintaged: at each date the
 * scorer sees the quarters that had actually been filed by then, so a
 * restatement cannot leak backwards and a quarter does not exist before its
 * filing. Prices and market cap are cut at the same date. Nothing the scorer
 * sees reaches forward; only the grading does.
 *
 * Forward returns are reported both raw and net of the universe's own move on
 * the same date, because a setup that fires in a rising market will look good
 * for reasons that have nothing to do with the setup.
 */

export type ReplayHorizon = { label: string; sessions: number };

export const DEFAULT_HORIZONS: ReplayHorizon[] = [
  { label: "3m", sessions: 63 },
  { label: "6m", sessions: 126 },
  { label: "12m", sessions: 252 },
];

type Observation = {
  symbol: string;
  date: string;
  setup: InflectionSetup;
  stale: boolean;
  forward: Map<string, number | null>;
};

export type SetupStats = {
  setup: InflectionSetup;
  label: string;
  observations: number;
  byHorizon: Array<{
    label: string;
    graded: number;
    meanReturn: number | null;
    medianReturn: number | null;
    meanExcess: number | null;
    hitRate: number | null;
  }>;
};

export type ReplayResult = {
  from: string;
  to: string;
  dates: number;
  instruments: number;
  observations: number;
  skippedStale: number;
  stats: SetupStats[];
};

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

export async function replayInflection(options?: {
  from?: string;
  to?: string;
  /** Score every Nth session. 21 is roughly monthly. */
  everyNSessions?: number;
  symbols?: string[];
  horizons?: ReplayHorizon[];
  /** Drop observations the scorer itself flagged as stale. */
  includeStale?: boolean;
}): Promise<ReplayResult> {
  const db = createAdminDb();
  const horizons = options?.horizons ?? DEFAULT_HORIZONS;
  const step = Math.max(1, options?.everyNSessions ?? 21);
  const wanted = options?.symbols?.map((symbol) => symbol.toUpperCase()) ?? [];

  const instruments = (
    await listWatchInstruments(db, { researchOnly: true })
  ).filter(
    (instrument) =>
      wanted.length === 0 || wanted.includes(instrument.symbol.toUpperCase()),
  );

  const calendar = await loadSessionCalendar(db, options?.from);
  const bounded = options?.to
    ? calendar.filter((date) => date <= options.to!)
    : calendar;
  const dates = bounded.filter((_, index) => index % step === 0);
  if (dates.length === 0) {
    throw new Error(
      "No sessions to replay. Ingest benchmark bars, or widen --from/--to.",
    );
  }

  console.log(
    `[score:replay] ${instruments.length} names over ${dates.length} dates ` +
      `(${dates[0]} → ${dates.at(-1)}, every ${step} sessions)`,
  );

  const observations: Observation[] = [];
  let skippedStale = 0;

  for (const instrument of instruments) {
    let history: InstrumentHistory;
    try {
      history = await loadInstrumentHistory(db, instrument.id);
    } catch (error) {
      console.error(
        `[score:replay] ${instrument.symbol}: ${
          error instanceof Error ? error.message : error
        }`,
      );
      continue;
    }

    // Hysteresis carries forward through the replay exactly as it does in
    // production, so the setups are path-dependent in the same way. Seeding it
    // from today's stored state would be look-ahead.
    let previous: InflectionHysteresis | null = null;

    for (const date of dates) {
      const inputs = sliceScorerInputsAsOf(history, date);
      if (inputs.closes.length === 0) continue;

      const snapshot = scoreInflection({
        quarters: inputs.quarters,
        closes: inputs.closes,
        marketCap: inputs.marketCap,
        asOf: inputs.lastBarDate ?? date,
        calculatedAt: `${date}T00:00:00.000Z`,
        priceThrough: inputs.lastBarDate,
        calendarThrough: date,
        previous,
      });
      previous = inflectionHysteresisFrom(snapshot);

      if (snapshot.stale && options?.includeStale !== true) {
        skippedStale += 1;
        continue;
      }

      const forward = new Map<string, number | null>();
      for (const horizon of horizons) {
        forward.set(
          horizon.label,
          forwardReturn(history.bars, date, horizon.sessions),
        );
      }

      observations.push({
        symbol: instrument.symbol,
        date,
        setup: snapshot.setup,
        stale: snapshot.stale,
        forward,
      });
    }
  }

  // The universe's own move on each date, so a setup is graded against what
  // simply being invested that day would have returned.
  const universe = new Map<string, Map<string, number[]>>();
  for (const observation of observations) {
    const byDate = universe.get(observation.date) ?? new Map<string, number[]>();
    for (const horizon of horizons) {
      const value = observation.forward.get(horizon.label);
      if (value == null) continue;
      const list = byDate.get(horizon.label) ?? [];
      list.push(value);
      byDate.set(horizon.label, list);
    }
    universe.set(observation.date, byDate);
  }

  const bySetup = new Map<InflectionSetup, Observation[]>();
  for (const observation of observations) {
    const list = bySetup.get(observation.setup) ?? [];
    list.push(observation);
    bySetup.set(observation.setup, list);
  }

  const stats: SetupStats[] = [...bySetup.entries()]
    .map(([setup, rows]) => ({
      setup,
      label: inflectionSetupLabel(setup),
      observations: rows.length,
      byHorizon: horizons.map((horizon) => {
        const returns: number[] = [];
        const excess: number[] = [];
        for (const row of rows) {
          const value = row.forward.get(horizon.label);
          if (value == null) continue;
          returns.push(value);
          const peers = universe.get(row.date)?.get(horizon.label) ?? [];
          const baseline = mean(peers);
          if (baseline != null) excess.push(value - baseline);
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
    from: dates[0] ?? "",
    to: dates.at(-1) ?? "",
    dates: dates.length,
    instruments: instruments.length,
    observations: observations.length,
    skippedStale,
    stats,
  };
}

function pct(value: number | null): string {
  return value == null ? "—" : `${(value * 100).toFixed(1)}%`;
}

export function printReplay(result: ReplayResult): void {
  console.log(
    `\n[score:replay] ${INFLECTION_SCORER_KEY} · ${result.observations} observations ` +
      `over ${result.dates} dates (${result.from} → ${result.to}), ` +
      `${result.skippedStale} skipped as stale\n`,
  );
  const width = Math.max(
    24,
    ...result.stats.map((row) => row.label.length + 2),
  );
  console.log(
    `${"setup".padEnd(width)}${"n".padStart(6)}${"horizon".padStart(9)}` +
      `${"graded".padStart(8)}${"mean".padStart(9)}${"median".padStart(9)}` +
      `${"vs univ".padStart(9)}${"hit".padStart(8)}`,
  );
  for (const row of result.stats) {
    let first = true;
    for (const horizon of row.byHorizon) {
      console.log(
        `${(first ? row.label : "").padEnd(width)}` +
          `${(first ? String(row.observations) : "").padStart(6)}` +
          `${horizon.label.padStart(9)}${String(horizon.graded).padStart(8)}` +
          `${pct(horizon.meanReturn).padStart(9)}${pct(horizon.medianReturn).padStart(9)}` +
          `${pct(horizon.meanExcess).padStart(9)}${pct(horizon.hitRate).padStart(8)}`,
      );
      first = false;
    }
  }
  console.log(
    "\n`vs univ` is the mean return less the average across every name scored " +
      "on the same date, so a setup that only fires in rising markets shows no edge.",
  );
}
