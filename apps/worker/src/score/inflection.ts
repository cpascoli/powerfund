import {
  INFLECTION_SCORER_KEY,
  INFLECTION_SCORER_VERSION,
  inflectionHysteresisFrom,
  inflectionSetupLabel,
  inflectionTransitionCause,
  scoreInflection,
  sliceScorerInputsAsOf,
  type InflectionHysteresis,
  type InflectionSnapshot,
} from "@powerfund/domain";

import { createAdminDb, listWatchInstruments, type AdminDb } from "../db";
import { loadInstrumentHistory } from "./history";

export type ScoreInflectionResult = {
  instruments: number;
  scored: number;
  transitions: number;
  failed: string[];
};

type QueryResult<T> = Promise<{ data: T; error: { message: string } | null }>;

function table(
  db: AdminDb,
  name: string,
): {
  select: (columns: string) => {
    eq: (column: string, value: string) => unknown;
  };
  upsert: (
    values: Record<string, unknown>,
    opts: { onConflict: string },
  ) => QueryResult<null>;
  insert: (values: Record<string, unknown>) => QueryResult<null>;
} {
  return db.from(name) as unknown as ReturnType<typeof table>;
}

function asSnapshot(value: unknown): InflectionSnapshot | null {
  if (value == null || typeof value !== "object") return null;
  const row = value as Partial<InflectionSnapshot>;
  if (row.scorerKey !== INFLECTION_SCORER_KEY) return null;
  if (typeof row.setup !== "string") return null;
  return value as InflectionSnapshot;
}

function asHysteresis(value: unknown): InflectionHysteresis | null {
  if (value == null || typeof value !== "object") return null;
  const row = value as Partial<InflectionHysteresis>;
  if (
    row.growth == null ||
    row.intensity == null ||
    row.fcf == null ||
    typeof row.inCorrection !== "boolean"
  ) {
    return null;
  }
  return value as InflectionHysteresis;
}

async function loadPrevious(
  db: AdminDb,
  instrumentId: string,
): Promise<{ snapshot: InflectionSnapshot | null; hysteresis: InflectionHysteresis | null }> {
  const { data, error } = (await (
    table(db, "instrument_setups").select("snapshot, hysteresis") as {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => QueryResult<{
            snapshot: unknown;
            hysteresis: unknown;
          } | null>;
        };
      };
    }
  )
    .eq("instrument_id", instrumentId)
    .eq("scorer_key", INFLECTION_SCORER_KEY)
    .maybeSingle()) as Awaited<
    QueryResult<{ snapshot: unknown; hysteresis: unknown } | null>
  >;
  if (error) throw new Error(error.message);
  return {
    snapshot: asSnapshot(data?.snapshot),
    hysteresis: asHysteresis(data?.hysteresis),
  };
}

async function loadCalendarThrough(db: AdminDb): Promise<string | null> {
  const { data: bench, error: benchError } = await db
    .from("benchmarks")
    .select("instrument_id")
    .eq("role", "success")
    .maybeSingle();
  if (benchError) throw new Error(benchError.message);
  const spyId = (bench as { instrument_id: string } | null)?.instrument_id;
  if (spyId == null) return null;
  const { data: bar, error: barError } = await db
    .from("market_bars")
    .select("bar_date")
    .eq("instrument_id", spyId)
    .order("bar_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (barError) throw new Error(barError.message);
  return (bar as { bar_date: string } | null)?.bar_date ?? null;
}

/**
 * Score the research universe as it stands at the last completed session.
 *
 * Inputs come from `sliceScorerInputsAsOf`, the same function a replay uses, so
 * "today" is just the last slice and a backtest cannot silently be measuring a
 * different scorer. Passing `asOf` scores an earlier date without writing.
 */
export async function scoreInflectionUniverse(options?: {
  asOf?: string;
}): Promise<ScoreInflectionResult> {
  const db = createAdminDb();
  const instruments = await listWatchInstruments(db, { researchOnly: true });
  const failed: string[] = [];
  let scored = 0;
  let transitions = 0;
  const calculatedAt = new Date().toISOString();
  const calendarThrough = await loadCalendarThrough(db);
  // Bound every read at the session being scored. Without an override that is
  // the newest session on the benchmark calendar, which is what the live job
  // has always used.
  const runAsOf = options?.asOf ?? calendarThrough ?? calculatedAt.slice(0, 10);

  console.log(
    `[score:inflection] ${instruments.length} research names (${INFLECTION_SCORER_KEY})`,
  );

  for (const instrument of instruments) {
    try {
      const [history, previous] = await Promise.all([
        loadInstrumentHistory(db, instrument.id),
        loadPrevious(db, instrument.id),
      ]);
      const inputs = sliceScorerInputsAsOf(history, runAsOf, {
        quoteCurrency: instrument.currency,
      });
      const asOf = inputs.lastBarDate ?? runAsOf;
      const snapshot = scoreInflection({
        quarters: inputs.quarters,
        closes: inputs.closes,
        marketCap: inputs.marketCap,
        asOf,
        calculatedAt,
        priceThrough: inputs.lastBarDate,
        calendarThrough,
        previous:
          previous.hysteresis ??
          (previous.snapshot
            ? inflectionHysteresisFrom(previous.snapshot)
            : null),
      });
      const cause = inflectionTransitionCause(previous.snapshot, snapshot);

      const { error: upsertError } = await table(db, "instrument_setups").upsert(
        {
          instrument_id: instrument.id,
          scorer_key: snapshot.scorerKey,
          scorer_version: snapshot.scorerVersion,
          setup: snapshot.setup,
          fundamental_state: snapshot.fundamentalState,
          completeness: snapshot.completeness,
          stale: snapshot.stale,
          period_end: snapshot.periodEnd,
          as_of: snapshot.asOf,
          calculated_at: snapshot.calculatedAt,
          ingested_at: snapshot.ingestedAt,
          days_since_period_end: snapshot.daysSincePeriodEnd,
          last_close: snapshot.correction.lastClose,
          closes_count: snapshot.closesCount,
          rationale: snapshot.rationale,
          snapshot,
          hysteresis: inflectionHysteresisFrom(snapshot),
        },
        { onConflict: "instrument_id,scorer_key" },
      );
      if (upsertError) throw new Error(upsertError.message);

      if (cause != null && previous.snapshot != null) {
        const { error: signalError } = await table(db, "signals").insert({
          instrument_id: instrument.id,
          source: "scorer",
          scorer_key: INFLECTION_SCORER_KEY,
          title: `${instrument.symbol}: ${inflectionSetupLabel(previous.snapshot.setup)} → ${inflectionSetupLabel(snapshot.setup)}`,
          rationale: snapshot.rationale,
          payload: {
            cause,
            previousSetup: previous.snapshot.setup,
            setup: snapshot.setup,
            scorerVersion: INFLECTION_SCORER_VERSION,
            periodEnd: snapshot.periodEnd,
            ingestedAt: snapshot.ingestedAt,
            stale: snapshot.stale,
            missing: snapshot.missing,
            lastClose: snapshot.correction.lastClose,
            snapshot,
          },
        });
        if (signalError) throw new Error(signalError.message);
        transitions += 1;
      }

      scored += 1;
    } catch (error) {
      failed.push(instrument.symbol);
      console.error(
        `[score:inflection] ${instrument.symbol} failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  const result = {
    instruments: instruments.length,
    scored,
    transitions,
    failed,
  };
  console.log("[score:inflection]", JSON.stringify(result));
  return result;
}

export async function scoreInflectionBestEffort(): Promise<void> {
  try {
    const result = await scoreInflectionUniverse();
    if (result.failed.length > 0) {
      console.error("[score:inflection] failed symbols", result.failed);
    }
  } catch (error) {
    console.error("[score:inflection]", error);
  }
}
