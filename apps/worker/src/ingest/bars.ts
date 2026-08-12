import { fetchDailyBars, fetchYahooMarketCap, sleep } from "@powerfund/data-clients";

import { createAdminDb, listWatchInstruments } from "../db";

function daysAgoIso(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export async function ingestBars(options: { days: number; pauseMs: number }) {
  const db = createAdminDb();
  const instruments = await listWatchInstruments(db);
  const startDate = daysAgoIso(options.days);
  const tiingoKey = process.env.TIINGO_API_KEY ?? null;

  console.log(
    `[ingest:bars] ${instruments.length} instruments from ${startDate}` +
      ` (chain: ${tiingoKey ? "tiingo→" : ""}yahoo→stooq; mcap: yahoo)`,
  );

  for (const instrument of instruments) {
    try {
      const { bars, source } = await fetchDailyBars({
        symbol: instrument.symbol,
        startDate,
        tiingoApiKey: tiingoKey,
      });

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
        const mcap = await fetchYahooMarketCap(instrument.symbol);
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

      console.log(
        `[ingest:bars] ${instrument.symbol}: ${bars.length} bars via ${source}${mcapLabel}`,
      );
    } catch (error) {
      console.error(
        `[ingest:bars] ${instrument.symbol} failed:`,
        error instanceof Error ? error.message : error,
      );
    }

    await sleep(options.pauseMs);
  }
}
