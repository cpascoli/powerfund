import { createAdminDb, type AdminDb } from "../db";
import { backfillMissingSnapshots } from "./backfill";

export type SnapshotPortfolioResult = {
  asOf: string;
  nav: number;
  cash: number;
  invested: number;
  positionsValue: number;
  positions: number;
  /** Symbols marked at cost because no stored close exists yet. */
  staleMarks: string[];
  backfilled: string[];
};

type OpenPositionRow = {
  instrument_id: string;
  quantity: number;
  avg_cost: number;
};

async function latestClose(
  db: AdminDb,
  instrumentId: string,
): Promise<number | null> {
  const { data, error } = await db
    .from("market_bars")
    .select("close, adj_close")
    .eq("instrument_id", instrumentId)
    .order("bar_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load close for ${instrumentId}: ${error.message}`);
  }
  const bar = data as { close: number | null; adj_close: number | null } | null;
  return bar?.adj_close ?? bar?.close ?? null;
}

function isUtcWeekend(iso: string): boolean {
  const weekday = new Date(iso).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/**
 * Write today's end-of-day portfolio snapshot: NAV = cash + positions marked
 * at the latest stored close (which the 22:00 UTC bars ingest refreshes).
 * Upserts on snapshot_date, so re-runs replace rather than duplicate.
 * Weekends are not session marks — skip the write.
 */
export async function snapshotPortfolio(): Promise<SnapshotPortfolioResult> {
  const db = createAdminDb();
  let backfilled: string[] = [];
  try {
    const result = await backfillMissingSnapshots(db);
    backfilled = result.written;
  } catch (error) {
    console.error("[snapshot:portfolio] backfill failed; writing today's mark anyway", error);
  }
  const asOf = new Date().toISOString();

  const [
    { data: stateData, error: stateError },
    { data: positionData, error: positionError },
  ] = await Promise.all([
    db.from("portfolio_state").select("cash").limit(1).maybeSingle(),
    db
      .from("positions")
      .select("instrument_id, quantity, avg_cost")
      .eq("status", "open"),
  ]);

  if (stateError) {
    throw new Error(`Failed to load cash: ${stateError.message}`);
  }
  if (positionError) {
    throw new Error(`Failed to load positions: ${positionError.message}`);
  }

  const cash = Number((stateData as { cash: number } | null)?.cash ?? 0);
  const positions = (positionData as OpenPositionRow[] | null) ?? [];

  const instrumentIds = [...new Set(positions.map((row) => row.instrument_id))];
  const [{ data: instruments, error: instrumentError }, { data: links }] =
    await Promise.all([
      instrumentIds.length
        ? db.from("instruments").select("id, symbol").in("id", instrumentIds)
        : Promise.resolve({ data: [], error: null } as const),
      instrumentIds.length
        ? db
            .from("instrument_themes")
            .select("instrument_id, theme_id, is_primary, themes(slug)")
            .in("instrument_id", instrumentIds)
        : Promise.resolve({ data: [], error: null } as const),
    ]);
  if (instrumentError) {
    throw new Error(`Failed to load instruments: ${instrumentError.message}`);
  }

  const symbolById = new Map(
    ((instruments as Array<{ id: string; symbol: string }> | null) ?? []).map(
      (row) => [row.id, row.symbol],
    ),
  );
  const themeByInstrument = new Map<string, string>();
  for (const link of (links as Array<{
    instrument_id: string;
    is_primary: boolean;
    themes: { slug: string } | Array<{ slug: string }> | null;
  }> | null) ?? []) {
    const theme = Array.isArray(link.themes) ? link.themes[0] : link.themes;
    if (!theme) continue;
    if (link.is_primary || !themeByInstrument.has(link.instrument_id)) {
      themeByInstrument.set(link.instrument_id, theme.slug);
    }
  }

  let invested = 0;
  let positionsValue = 0;
  const staleMarks: string[] = [];
  const positionExposures: Array<{
    symbol: string;
    quantity: number;
    avgCost: number;
    close: number | null;
    value: number;
  }> = [];
  const themeValues = new Map<string, number>();

  for (const position of positions) {
    const quantity = Number(position.quantity);
    const avgCost = Number(position.avg_cost);
    const costBasis = quantity * avgCost;
    const close = await latestClose(db, position.instrument_id);
    const symbol = symbolById.get(position.instrument_id) ?? position.instrument_id;
    const value = close == null ? costBasis : quantity * close;

    if (close == null) {
      staleMarks.push(symbol);
    }
    invested += costBasis;
    positionsValue += value;
    positionExposures.push({ symbol, quantity, avgCost, close, value });

    const slug = themeByInstrument.get(position.instrument_id) ?? "other";
    themeValues.set(slug, (themeValues.get(slug) ?? 0) + value);
  }

  const nav = cash + positionsValue;
  const exposures = {
    positions: positionExposures,
    themes: Object.fromEntries(themeValues),
  };
  const notes =
    staleMarks.length > 0
      ? `Marked at cost (no stored close): ${staleMarks.join(", ")}`
      : null;

  if (isUtcWeekend(asOf)) {
    console.warn(
      `[snapshot:portfolio] skipping weekend mark ${asOf.slice(0, 10)}`,
    );
    return {
      asOf,
      nav,
      cash,
      invested,
      positionsValue,
      positions: positions.length,
      staleMarks,
      backfilled,
    };
  }

  const { error: upsertError } = await db.from("portfolio_snapshots").upsert(
    {
      as_of: asOf,
      nav,
      cash,
      invested,
      positions_value: positionsValue,
      exposures,
      notes,
    },
    { onConflict: "snapshot_date" },
  );
  if (upsertError) {
    throw new Error(`Failed to write snapshot: ${upsertError.message}`);
  }

  return {
    asOf,
    nav,
    cash,
    invested,
    positionsValue,
    positions: positions.length,
    staleMarks,
    backfilled,
  };
}
