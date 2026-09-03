import {
  fetchQuarterlyFundamentals,
  sleep,
} from "@powerfund/data-clients";
import { resolveKnowableAt, vendorSymbol } from "@powerfund/domain";

import { createAdminDb, listWatchInstruments } from "../db";

export type IngestFundamentalsResult = {
  instruments: number;
  succeeded: number;
  /** Observations that were new — a first read, or a restatement. */
  newVintages: number;
  /** Quarters whose filing date had to be assumed because the vendor gives none. */
  estimatedFilings: number;
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
  let newVintages = 0;
  let estimatedFilings = 0;

  console.log(
    `[ingest:fundamentals] ${instruments.length} instruments (chain: sec+yahoo holes)`,
  );

  for (const instrument of instruments) {
    try {
      const { rows, source } = await fetchQuarterlyFundamentals({
        symbol: vendorSymbol(instrument.symbol, instrument.dataSymbol),
      });

      const payload = rows.map((row) => {
        const { knowableAt, basis } = resolveKnowableAt(
          row.periodEnd,
          row.filedAt,
        );
        return {
          instrument_id: instrument.id,
          period_end: row.periodEnd,
          fiscal_period: row.fiscalPeriod,
          filed_at: row.filedAt,
          knowable_at: knowableAt,
          knowable_basis: basis,
          revenue: row.revenue,
          free_cash_flow: row.freeCashFlow,
          capex: row.capex,
          net_debt: row.netDebt,
          shares_diluted: row.sharesDiluted,
          currency: row.currency,
          source: row.source,
          raw: row.raw,
        };
      });

      // Append-only. A BEFORE trigger drops an unchanged re-read, so the rows
      // that come back are exactly the new observations; an AFTER trigger keeps
      // fundamentals_quarterly pointed at the newest one.
      const { data, error } = await db
        .from("fundamentals_vintages")
        .insert(payload)
        .select("id");

      if (error) {
        throw new Error(error.message);
      }

      const added = data?.length ?? 0;
      const estimated = payload.filter(
        (row) => row.knowable_basis === "estimated",
      ).length;
      newVintages += added;
      estimatedFilings += estimated;

      succeeded += 1;
      console.log(
        `[ingest:fundamentals] ${instrument.symbol}: ${payload.length} quarters via ${source}` +
          ` (${added} new vintage${added === 1 ? "" : "s"}` +
          `${estimated > 0 ? `, ${estimated} estimated filing date${estimated === 1 ? "" : "s"}` : ""})`,
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
    newVintages,
    estimatedFilings,
    failed,
  };
}
