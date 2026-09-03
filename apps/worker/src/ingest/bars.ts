import { fetchDailyBars, fetchYahooMarketCap, sleep } from "@powerfund/data-clients";
import {
  describePriceRebase,
  detectPriceRebase,
  vendorSymbol,
  type StoredClose,
} from "@powerfund/domain";

import { createAdminDb, listWatchInstruments, type AdminDb } from "../db";

/**
 * How far back to refetch once the vendor has re-based a series. A split
 * rewrites the whole history, so refreshing the usual window would leave the
 * two bases spliced together.
 */
const REBASE_REFETCH_DAYS = 1900;

function daysAgoIso(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export type IngestBarsResult = {
  startDate: string;
  instruments: number;
  succeeded: number;
  /** Symbols whose whole series was refetched after the vendor re-based it. */
  rebased: string[];
  failed: string[];
};

async function storedCloses(
  db: AdminDb,
  instrumentId: string,
  fromDate: string,
): Promise<StoredClose[]> {
  const { data, error } = await db
    .from("market_bars")
    .select("bar_date, close")
    .eq("instrument_id", instrumentId)
    .gte("bar_date", fromDate)
    .order("bar_date", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data as Array<{ bar_date: string; close: number | null }> | null) ?? [])
    .filter((row) => row.close != null)
    .map((row) => ({ date: row.bar_date, close: Number(row.close) }));
}

export async function ingestBars(options: {
  days: number;
  pauseMs: number;
  symbols?: string[];
}): Promise<IngestBarsResult> {
  const db = createAdminDb();
  const wanted = options.symbols?.map((symbol) => symbol.toUpperCase());
  const instruments = (await listWatchInstruments(db)).filter((instrument) =>
    wanted == null || wanted.length === 0
      ? true
      : wanted.includes(instrument.symbol.toUpperCase()),
  );
  const startDate = daysAgoIso(options.days);
  const tiingoKey = process.env.TIINGO_API_KEY ?? null;
  const failed: string[] = [];
  const rebased: string[] = [];
  let succeeded = 0;

  console.log(
    `[ingest:bars] ${instruments.length} instruments from ${startDate}` +
      ` (chain: ${tiingoKey ? "tiingo→" : ""}yahoo→stooq; mcap: yahoo)`,
  );

  for (const instrument of instruments) {
    try {
      const listing = vendorSymbol(instrument.symbol, instrument.dataSymbol);
      let { bars, source } = await fetchDailyBars({
        symbol: listing,
        startDate,
        tiingoApiKey: tiingoKey,
      });

      // Did the vendor change its mind about sessions we already hold? That is
      // how a split reaches us — silently, as different numbers for the same
      // days. Upserting the window over the top would splice two price bases
      // together and leave the older half permanently wrong, because the next
      // run only ever looks at the same few days.
      let rebaseNote = "";
      const held = await storedCloses(db, instrument.id, startDate);
      const rebase = detectPriceRebase(
        held,
        bars
          .filter((bar): bar is typeof bar & { close: number } => bar.close != null)
          .map((bar) => ({ date: bar.date, close: bar.close })),
      );
      if (rebase.rebased) {
        const wideStart = daysAgoIso(REBASE_REFETCH_DAYS);
        const refetched = await fetchDailyBars({
          symbol: listing,
          startDate: wideStart,
          tiingoApiKey: tiingoKey,
        });
        bars = refetched.bars;
        source = refetched.source;
        rebased.push(instrument.symbol);
        rebaseNote = ` — REBASED: ${describePriceRebase(rebase)}; refetched from ${wideStart}`;
        console.warn(`[ingest:bars] ${instrument.symbol}${rebaseNote}`);
      }

      const rows = bars.map((bar) => ({
        instrument_id: instrument.id,
        bar_date: bar.date,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        adj_close: bar.adjClose,
        volume: bar.volume,
        source: bar.source,
      }));

      const { error } = await (
        db as unknown as {
          from: (table: "market_bars") => {
            upsert: (
              values: typeof rows,
              opts: { onConflict: string },
            ) => Promise<{ error: { message: string } | null }>;
          };
        }
      )
        .from("market_bars")
        .upsert(rows, { onConflict: "instrument_id,bar_date" });

      if (error) {
        throw new Error(error.message);
      }

      let mcapLabel = "";
      try {
        const mcap =
          (await fetchYahooMarketCap(instrument.symbol)) ??
          (listing === instrument.symbol
            ? null
            : await fetchYahooMarketCap(listing));
        if (mcap) {
          const { error: mcapError } = await (
            db as unknown as {
              from: (table: "market_caps") => {
                upsert: (
                  values: Record<string, unknown>,
                  opts: { onConflict: string },
                ) => Promise<{ error: { message: string } | null }>;
              };
            }
          )
            .from("market_caps")
            .upsert(
              {
                instrument_id: instrument.id,
                as_of_date: mcap.asOfDate,
                market_cap: mcap.marketCap,
                source: mcap.source,
              },
              { onConflict: "instrument_id,as_of_date" },
            );
          if (mcapError) {
            throw new Error(mcapError.message);
          }
          mcapLabel = `, mcap ${Math.round(mcap.marketCap / 1e9)}B`;
        }
      } catch (mcapErr) {
        mcapLabel = `, mcap skipped (${mcapErr instanceof Error ? mcapErr.message : mcapErr})`;
      }

      succeeded += 1;
      console.log(
        `[ingest:bars] ${instrument.symbol}: ${bars.length} bars via ${source}${mcapLabel}${rebaseNote}`,
      );
    } catch (error) {
      failed.push(instrument.symbol);
      console.error(
        `[ingest:bars] ${instrument.symbol} failed:`,
        error instanceof Error ? error.message : error,
      );
    }

    await sleep(options.pauseMs);
  }

  return {
    startDate,
    instruments: instruments.length,
    succeeded,
    rebased,
    failed,
  };
}

