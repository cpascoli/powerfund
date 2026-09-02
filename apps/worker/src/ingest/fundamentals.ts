import {
  fetchQuarterlyFundamentals,
  sleep,
} from "@powerfund/data-clients";
import { vendorSymbol } from "@powerfund/domain";

import { createAdminDb, listWatchInstruments } from "../db";

export type IngestFundamentalsResult = {
  instruments: number;
  succeeded: number;
  failed: string[];
};

export async function ingestFundamentals(options: {
  pauseMs: number;
  symbols?: string[];
}): Promise<IngestFundamentalsResult> {
  const db = createAdminDb();
  const wanted = options.symbols?.map((symbol) => symbol.toUpperCase());
  const instruments = (await listWatchInstruments(db, { researchOnly: true })).filter(
    (instrument) =>
      wanted == null || wanted.length === 0
        ? true
        : wanted.includes(instrument.symbol.toUpperCase()),
  );
  const failed: string[] = [];
  let succeeded = 0;

  console.log(
    `[ingest:fundamentals] ${instruments.length} instruments (chain: sec+yahoo holes)`,
  );

  for (const instrument of instruments) {
    try {
      const { rows, source } = await fetchQuarterlyFundamentals({
        symbol: vendorSymbol(instrument.symbol, instrument.dataSymbol),
      });

      const payload = rows.map((row) => ({
        instrument_id: instrument.id,
        period_end: row.periodEnd,
        fiscal_period: row.fiscalPeriod,
        revenue: row.revenue,
        free_cash_flow: row.freeCashFlow,
        capex: row.capex,
        net_debt: row.netDebt,
        shares_diluted: row.sharesDiluted,
        currency: row.currency,
        source: row.source,
        raw: row.raw,
      }));

      const { error } = await (
        db as unknown as {
          from: (table: "fundamentals_quarterly") => {
            upsert: (
              values: typeof payload,
              opts: { onConflict: string },
            ) => Promise<{ error: { message: string } | null }>;
          };
        }
      )
        .from("fundamentals_quarterly")
        .upsert(payload, { onConflict: "instrument_id,period_end" });

      if (error) {
        throw new Error(error.message);
      }

      succeeded += 1;
      console.log(
        `[ingest:fundamentals] ${instrument.symbol}: ${payload.length} quarters via ${source}`,
      );
    } catch (error) {
      failed.push(instrument.symbol);
      console.error(
        `[ingest:fundamentals] ${instrument.symbol} failed:`,
        error instanceof Error ? error.message : error,
      );
    }

    await sleep(options.pauseMs);
  }

  return {
    instruments: instruments.length,
    succeeded,
    failed,
  };
}
