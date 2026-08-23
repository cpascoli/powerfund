import {
  INFLECTION_SCORER_KEY,
  INFLECTION_SCORER_VERSION,
  inflectionHysteresisFrom,
  inflectionSetupLabel,
  inflectionTransitionCause,
  scoreInflection,
  type FundamentalQuarter,
  type InflectionHysteresis,
  type InflectionSnapshot,
} from "@powerfund/domain";

import { createAdminDb, listWatchInstruments, type AdminDb } from "../db";

const BAR_WINDOW = 400;

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

async function loadQuarters(
  db: AdminDb,
  instrumentId: string,
): Promise<FundamentalQuarter[]> {
  const { data, error } = (await (
    table(db, "fundamentals_quarterly").select(
      "period_end, revenue, capex, free_cash_flow, net_debt, shares_diluted, ingested_at",
    ) as {
      eq: (column: string, value: string) => {
        order: (
          column: string,
          opts: { ascending: boolean },
        ) => {
          limit: (count: number) => QueryResult<
            Array<{
              period_end: string;
              revenue: number | null;
              capex: number | null;
              free_cash_flow: number | null;
              net_debt: number | null;
              shares_diluted: number | null;
              ingested_at: string | null;
            }> | null
          >;
        };
      };
    }
  )
    .eq("instrument_id", instrumentId)
    .order("period_end", { ascending: true })
    .limit(40)) as Awaited<
    QueryResult<
      Array<{
        period_end: string;
        revenue: number | null;
        capex: number | null;
        free_cash_flow: number | null;
        net_debt: number | null;
        shares_diluted: number | null;
        ingested_at: string | null;
      }> | null
    >
  >;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    periodEnd: row.period_end,
    revenue: row.revenue,
    capex: row.capex,
    freeCashFlow: row.free_cash_flow,
    netDebt: row.net_debt,
    sharesDiluted: row.shares_diluted,
    ingestedAt: row.ingested_at,
  }));
}

async function loadCloses(
  db: AdminDb,
  instrumentId: string,
): Promise<{ closes: number[]; lastBarDate: string | null }> {
  const { data, error } = (await (
    table(db, "market_bars").select("bar_date, close, adj_close") as {
      eq: (column: string, value: string) => {
        order: (
          column: string,
          opts: { ascending: boolean },
        ) => {
          limit: (count: number) => QueryResult<
            Array<{
              bar_date: string;
              close: number | null;
              adj_close: number | null;
            }> | null
          >;
        };
      };
    }
  )
    .eq("instrument_id", instrumentId)
    .order("bar_date", { ascending: false })
    .limit(BAR_WINDOW)) as Awaited<
    QueryResult<
      Array<{
        bar_date: string;
        close: number | null;
        adj_close: number | null;
      }> | null
    >
  >;
  if (error) throw new Error(error.message);
  const rows = [...(data ?? [])].reverse();
  const closes: number[] = [];
  for (const row of rows) {
    const close = row.adj_close ?? row.close;
    if (close == null) continue;
    closes.push(Number(close));
  }
  return {
    closes,
    lastBarDate: rows[rows.length - 1]?.bar_date ?? null,
  };
}

async function loadMarketCap(
  db: AdminDb,
  instrumentId: string,
): Promise<number | null> {
  const { data, error } = (await (
    table(db, "market_caps").select("market_cap") as {
      eq: (column: string, value: string) => {
        order: (
          column: string,
          opts: { ascending: boolean },
        ) => {
          limit: (count: number) => QueryResult<
            Array<{ market_cap: number }> | null
          >;
        };
      };
    }
  )
    .eq("instrument_id", instrumentId)
    .order("as_of_date", { ascending: false })
    .limit(1)) as Awaited<
    QueryResult<Array<{ market_cap: number }> | null>
  >;
  if (error) throw new Error(error.message);
  const row = data?.[0];
  return row == null ? null : Number(row.market_cap);
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

export async function scoreInflectionUniverse(): Promise<ScoreInflectionResult> {
  const db = createAdminDb();
  const instruments = await listWatchInstruments(db, { researchOnly: true });
  const failed: string[] = [];
  let scored = 0;
  let transitions = 0;
  const calculatedAt = new Date().toISOString();
  const calendarThrough = await loadCalendarThrough(db);

  console.log(
    `[score:inflection] ${instruments.length} research names (${INFLECTION_SCORER_KEY})`,
  );

  for (const instrument of instruments) {
    try {
      const [quarters, price, marketCap, previous] = await Promise.all([
        loadQuarters(db, instrument.id),
        loadCloses(db, instrument.id),
        loadMarketCap(db, instrument.id),
        loadPrevious(db, instrument.id),
      ]);
      const asOf = price.lastBarDate ?? calculatedAt.slice(0, 10);
      const snapshot = scoreInflection({
        quarters,
        closes: price.closes,
        marketCap,
        asOf,
        calculatedAt,
        priceThrough: price.lastBarDate,
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
