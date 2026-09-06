import { fetchDailyBars, fetchYahooMarketCap, sleep } from "@powerfund/data-clients";
import {
  describePriceRebase,
  detectPriceRebase,
  findSeriesDiscontinuities,
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

const PAGE = 1000;

/**
 * Every stored close from `fromDate`, paged.
 *
 * PostgREST caps a response at 1,000 rows and says nothing about it. Ordered
 * ascending, the rows it drops are the most *recent* ones — precisely where a
 * fresh split appears. A 1,900-day repair on 6 September 2026 reported
 * "1000/1000 stored sessions disagree" for a 1,306-session series: the
 * comparison never saw the last 306 days it was supposed to be checking.
 */
async function storedCloses(
  db: AdminDb,
  instrumentId: string,
  fromDate: string,
): Promise<StoredClose[]> {
  const out: StoredClose[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db
      .from("market_bars")
      .select("bar_date, close")
      .eq("instrument_id", instrumentId)
      .gte("bar_date", fromDate)
      .order("bar_date", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data as Array<{ bar_date: string; close: number | null }> | null) ?? [];
    for (const row of page) {
      if (row.close == null) continue;
      out.push({ date: row.bar_date, close: Number(row.close) });
    }
    if (page.length < PAGE) return out;
  }
}

/** The oldest session we hold, so a repair can reach the start of the series. */
async function earliestStoredBar(
  db: AdminDb,
  instrumentId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("market_bars")
    .select("bar_date")
    .eq("instrument_id", instrumentId)
    .order("bar_date", { ascending: true })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = (data as Array<{ bar_date: string }> | null)?.[0];
  return row?.bar_date ?? null;
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
      if (rebase.rebased && !rebase.looksLikeSplit) {
        // One odd session is a bad print, not a split. Overwriting five years of
        // history on that evidence is how a correct APH series was destroyed on
        // 4 September 2026. Keep the narrow window and say so.
        rebaseNote = ` — DISAGREES: ${describePriceRebase(rebase)}; history left alone`;
        console.warn(`[ingest:bars] ${instrument.symbol}${rebaseNote}`);
      } else if (rebase.rebased) {
        // A fixed lookback cannot reach a series older than itself. Repairing
        // APH with --days=1900 on 6 September started at 2021-06-24 and left
        // 2021-06-22 and -23 stranded before the window, still at twice the
        // real price. Go back to the oldest row we actually hold.
        const earliest = await earliestStoredBar(db, instrument.id);
        const fixedStart = daysAgoIso(REBASE_REFETCH_DAYS);
        const wideStart =
          earliest != null && earliest < fixedStart ? earliest : fixedStart;
        const refetched = await fetchDailyBars({
          symbol: listing,
          startDate: wideStart,
          tiingoApiKey: tiingoKey,
        });
        // The vendor was wrong once already — that is why we are here. A series
        // it serves with a split-shaped hole in it is not a repair, so refuse
        // it rather than writing five years of spliced prices over good ones.
        const broken = findSeriesDiscontinuities(
          refetched.bars
            .filter((bar): bar is typeof bar & { close: number } => bar.close != null)
            .map((bar) => ({ date: bar.date, close: bar.close })),
        );
        if (broken.length > 0) {
          const first = broken[0];
          rebaseNote =
            ` — REFETCH REJECTED: ${describePriceRebase(rebase)}, but the ${wideStart} series` +
            ` still jumps ${first?.changePct.toFixed(1)}% on ${first?.date}` +
            ` (${broken.length} discontinuit${broken.length === 1 ? "y" : "ies"}); history left alone`;
          console.warn(`[ingest:bars] ${instrument.symbol}${rebaseNote}`);
        } else {
          bars = refetched.bars;
          source = refetched.source;
          rebased.push(instrument.symbol);
          rebaseNote = ` — REBASED: ${describePriceRebase(rebase)}; refetched from ${wideStart}`;
          console.warn(`[ingest:bars] ${instrument.symbol}${rebaseNote}`);
        }
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

