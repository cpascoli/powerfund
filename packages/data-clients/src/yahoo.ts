import YahooFinance from "yahoo-finance2";

import type { DailyBar, MarketCapPoint, QuarterlyFundamentals } from "./types";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

function toDateOnly(value: Date | string | number | null | undefined): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

export async function fetchYahooDailyBars(args: {
  symbol: string;
  startDate: string;
  endDate?: string;
}): Promise<DailyBar[]> {
  const result = await yahooFinance.chart(args.symbol, {
    period1: args.startDate,
    period2: args.endDate ?? new Date(),
    interval: "1d",
    return: "array",
  });

  const quotes = result.quotes ?? [];
  return quotes
    .map((row) => ({
      date: toDateOnly(row.date) ?? args.startDate,
      open: num(row.open),
      high: num(row.high),
      low: num(row.low),
      close: num(row.close),
      adjClose: num(row.adjclose) ?? num(row.close),
      volume: num(row.volume),
      source: "yahoo",
    }))
    .filter((row) => row.close != null);
}

export async function fetchYahooMarketCap(
  symbol: string,
): Promise<MarketCapPoint | null> {
  const quote = await yahooFinance.quote(symbol);
  const marketCap = num(quote.marketCap);
  if (marketCap == null) return null;

  return {
    asOfDate: toDateOnly(quote.regularMarketTime) ?? toDateOnly(new Date())!,
    marketCap,
    source: "yahoo",
  };
}

type FundamentalsRow = Record<string, unknown> & { date?: Date | string };

export async function fetchYahooQuarterlyFundamentals(
  symbol: string,
  startDate = "2018-01-01",
): Promise<QuarterlyFundamentals[]> {
  const rows = (await yahooFinance.fundamentalsTimeSeries(symbol, {
    period1: startDate,
    type: "quarterly",
    module: "all",
  })) as FundamentalsRow[];

  const byPeriod = new Map<string, QuarterlyFundamentals>();

  for (const row of rows) {
    const periodEnd = toDateOnly(row.date);
    if (!periodEnd) continue;

    const revenue =
      num(row.quarterlyTotalRevenue) ??
      num(row.quarterlyOperatingRevenue) ??
      null;
    const fcf = num(row.quarterlyFreeCashFlow);
    const capexRaw =
      num(row.quarterlyCapitalExpenditure) ??
      num(row.quarterlyPurchaseOfPPE);
    const capex = capexRaw == null ? null : Math.abs(capexRaw);
    const totalDebt = num(row.quarterlyTotalDebt);
    const cash =
      num(row.quarterlyCashAndCashEquivalents) ??
      num(row.quarterlyCashCashEquivalentsAndShortTermInvestments);
    const netDebt =
      totalDebt != null && cash != null ? totalDebt - cash : null;
    const shares =
      num(row.quarterlyShareIssued) ??
      num(row.quarterlyOrdinarySharesNumber) ??
      null;

    const existing = byPeriod.get(periodEnd);
    byPeriod.set(periodEnd, {
      periodEnd,
      fiscalPeriod: null,
      revenue: revenue ?? existing?.revenue ?? null,
      freeCashFlow: fcf ?? existing?.freeCashFlow ?? null,
      capex: capex ?? existing?.capex ?? null,
      netDebt: netDebt ?? existing?.netDebt ?? null,
      sharesDiluted: shares ?? existing?.sharesDiluted ?? null,
      currency: "USD",
      source: "yahoo",
      raw: { ...(existing?.raw ?? {}), ...row },
    });
  }

  return [...byPeriod.values()].sort((a, b) =>
    a.periodEnd < b.periodEnd ? 1 : -1,
  );
}
