import { assessBarsFreshness, type BarsFreshness } from "@powerfund/domain";

import { createAdminDb, type AdminDb } from "../db";

/**
 * Newest stored session for one instrument.
 *
 * One query per instrument rather than a windowed `in(...)` scan: the open book
 * is a handful of rows, and PostgREST caps a response at 1,000 rows without
 * saying so, which is exactly how a wide bar query loses its most recent dates.
 */
async function latestBarDate(
  db: AdminDb,
  instrumentId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("market_bars")
    .select("bar_date")
    .eq("instrument_id", instrumentId)
    .order("bar_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to load bars: ${error.message}`);
  return (data as { bar_date: string } | null)?.bar_date ?? null;
}

async function successBenchmarkId(db: AdminDb): Promise<string> {
  const { data, error } = await db
    .from("benchmarks")
    .select("instrument_id")
    .eq("role", "success")
    .maybeSingle();
  if (error) throw new Error(`Failed to load benchmark: ${error.message}`);
  const id = (data as { instrument_id: string } | null)?.instrument_id;
  if (id == null) {
    throw new Error(
      "No success benchmark is configured — SPY bars are the trading calendar.",
    );
  }
  return id;
}

type OpenPositionRow = {
  instrument_id: string;
  instruments: { symbol: string } | Array<{ symbol: string }> | null;
};

async function openHoldings(
  db: AdminDb,
): Promise<Array<{ id: string; symbol: string }>> {
  const { data, error } = await db
    .from("positions")
    .select("instrument_id, instruments(symbol)")
    .eq("status", "open");
  if (error) throw new Error(`Failed to load positions: ${error.message}`);

  const seen = new Map<string, string>();
  for (const row of ((data as OpenPositionRow[] | null) ?? [])) {
    const link = Array.isArray(row.instruments) ? row.instruments[0] : row.instruments;
    if (link == null) continue;
    seen.set(row.instrument_id, link.symbol);
  }
  return [...seen].map(([id, symbol]) => ({ id, symbol }));
}

/** Read the stored calendar and the open book, and judge both against the clock. */
export async function loadBarsFreshness(options?: {
  now?: Date;
  db?: AdminDb;
}): Promise<BarsFreshness> {
  const db = options?.db ?? createAdminDb();
  const [benchmarkId, holdings] = await Promise.all([
    successBenchmarkId(db),
    openHoldings(db),
  ]);

  const [benchmarkThrough, holdingSessions] = await Promise.all([
    latestBarDate(db, benchmarkId),
    Promise.all(
      holdings.map(async (row) => ({
        symbol: row.symbol,
        through: await latestBarDate(db, row.id),
      })),
    ),
  ]);

  return assessBarsFreshness({
    benchmarkThrough,
    holdings: holdingSessions,
    asOf: (options?.now ?? new Date()).toISOString(),
  });
}
