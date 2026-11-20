import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assessBookIntegrity,
  fillBasisMismatches,
  fillSessionDate,
  perShareOnCurrentBasis,
  splitFactorAfter,
  type BookIntegrity,
  type CorporateActionSource,
  type FillBasisInput,
  type PendingCorporateAction,
  type StockSplit,
} from "@powerfund/domain";

import type { Database } from "./database.types";

/**
 * Corporate-action IO, shared by the web app and the worker so there is one
 * answer to "which splits count" and one to "can this valuation be trusted".
 * The rules themselves are in @powerfund/domain; this file only loads.
 */

type Db = SupabaseClient<Database>;

type SymbolLink = { symbol: string } | Array<{ symbol: string }> | null;

function symbolOf(link: SymbolLink): string | null {
  const row = Array.isArray(link) ? link[0] : link;
  return row?.symbol ?? null;
}

/**
 * Every *applied* split. A pending one is a suspicion and restates nothing.
 *
 * The table is a handful of rows and will stay that way, so there is no
 * instrument filter to get wrong and no page to fall off the end of.
 */
export async function loadAppliedSplits(db: Db): Promise<StockSplit[]> {
  const { data, error } = await db
    .from("corporate_actions")
    .select("instrument_id, effective_date, split_numerator, split_denominator")
    .eq("action_type", "split")
    .eq("status", "applied")
    .order("effective_date", { ascending: true });
  if (error) {
    throw new Error(`Failed to load corporate actions: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    instrumentId: row.instrument_id,
    effectiveDate: row.effective_date,
    numerator: Number(row.split_numerator),
    denominator: Number(row.split_denominator),
  }));
}

async function latestBarDate(db: Db, instrumentId: string): Promise<string | null> {
  const { data, error } = await db
    .from("market_bars")
    .select("bar_date")
    .eq("instrument_id", instrumentId)
    .order("bar_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to load bars: ${error.message}`);
  return data?.bar_date ?? null;
}

/**
 * Coverage, pending splits and share-basis agreement for the open book.
 *
 * One query per holding rather than a windowed scan: the book is a dozen names
 * and PostgREST drops everything past row 1,000 without saying so, which is
 * how a wide bar query loses exactly the newest dates this is asking about.
 */
export async function loadBookIntegrity(
  db: Db,
  asOf: Date = new Date(),
): Promise<BookIntegrity> {
  const [
    { data: positionData, error: positionError },
    { data: benchmarkData, error: benchmarkError },
    { data: pendingData, error: pendingError },
    splits,
  ] = await Promise.all([
    db.from("positions").select("instrument_id, instruments(symbol)").eq("status", "open"),
    db.from("benchmarks").select("instrument_id").eq("role", "success").maybeSingle(),
    db
      .from("corporate_actions")
      .select(
        "instrument_id, effective_date, split_numerator, split_denominator, source, instruments(symbol)",
      )
      .eq("status", "pending")
      .order("effective_date", { ascending: true }),
    loadAppliedSplits(db),
  ]);
  if (positionError) {
    throw new Error(`Failed to load positions: ${positionError.message}`);
  }
  if (benchmarkError) {
    throw new Error(`Failed to load benchmark: ${benchmarkError.message}`);
  }
  if (pendingError) {
    throw new Error(`Failed to load corporate actions: ${pendingError.message}`);
  }

  const held = new Map<string, string>();
  for (const row of positionData ?? []) {
    const symbol = symbolOf(row.instruments as SymbolLink);
    if (symbol != null) held.set(row.instrument_id, symbol);
  }
  const heldIds = [...held.keys()];

  const [benchmarkThrough, holdings, fills] = await Promise.all([
    benchmarkData?.instrument_id == null
      ? Promise.resolve(null)
      : latestBarDate(db, benchmarkData.instrument_id),
    Promise.all(
      [...held].map(async ([id, symbol]) => ({
        symbol,
        through: await latestBarDate(db, id),
      })),
    ),
    loadFillBasisInputs(db, held, splits),
  ]);

  const pendingCorporateActions: PendingCorporateAction[] = (pendingData ?? []).map(
    (row) => ({
      symbol: symbolOf(row.instruments as SymbolLink) ?? row.instrument_id,
      effectiveDate: row.effective_date,
      numerator: Number(row.split_numerator),
      denominator: Number(row.split_denominator),
      source: row.source as CorporateActionSource,
      held: heldIds.includes(row.instrument_id),
    }),
  );

  return assessBookIntegrity({
    benchmarkThrough,
    holdings,
    pendingCorporateActions,
    basisMismatches: fillBasisMismatches(fills),
    asOf: asOf.toISOString(),
  });
}

/**
 * Each fill of a held name beside the stored bar for its session, with the fill
 * price restated by the splits we have applied — so a split we have handled
 * agrees, and one we have not (or one the vendor has not) stands out.
 */
async function loadFillBasisInputs(
  db: Db,
  held: ReadonlyMap<string, string>,
  splits: readonly StockSplit[],
): Promise<FillBasisInput[]> {
  if (held.size === 0) return [];
  const { data, error } = await db
    .from("transactions")
    .select("occurred_at, instrument_id, price")
    .in("instrument_id", [...held.keys()])
    .in("kind", ["buy", "sell"])
    .order("occurred_at", { ascending: true });
  if (error) throw new Error(`Failed to load fills: ${error.message}`);

  return Promise.all(
    (data ?? [])
      .filter((row) => row.instrument_id != null && row.price != null)
      .map(async (row) => {
        const instrumentId = row.instrument_id as string;
        const session = fillSessionDate(row.occurred_at);
        // The bar for the session itself, or the last one before it: a fill
        // booked on a market holiday has no bar of its own.
        const { data: bar, error: barError } = await db
          .from("market_bars")
          .select("bar_date, low, high, close")
          .eq("instrument_id", instrumentId)
          .lte("bar_date", session)
          .order("bar_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (barError) throw new Error(`Failed to load bars: ${barError.message}`);
        return {
          symbol: held.get(instrumentId) ?? instrumentId,
          session,
          price: perShareOnCurrentBasis(
            Number(row.price),
            splitFactorAfter(splits, instrumentId, session),
          ),
          bar:
            bar == null
              ? null
              : {
                  low: bar.low == null ? null : Number(bar.low),
                  high: bar.high == null ? null : Number(bar.high),
                  close: bar.close == null ? null : Number(bar.close),
                },
        };
      }),
  );
}
