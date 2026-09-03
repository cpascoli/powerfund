import YahooFinance from "yahoo-finance2";

import type {
  DailyBar,
  LiveQuote,
  MarketCapPoint,
  MarketState,
  QuarterlyFundamentals,
} from "./types";

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
  const currency =
    typeof quote.currency === "string" ? quote.currency.toUpperCase() : null;
  if (currency != null && currency !== "USD") return null;

  return {
    asOfDate: toDateOnly(quote.regularMarketTime) ?? toDateOnly(new Date())!,
    marketCap,
    source: "yahoo",
  };
}

function toMarketState(value: unknown): MarketState {
  switch (value) {
    case "REGULAR":
    case "PRE":
    case "POST":
    case "CLOSED":
    case "PREPRE":
    case "POSTPOST":
      return value;
    case "UNKNOWN":
      return "UNKNOWN";
    default:
      return "UNKNOWN";
  }
}

function toIso(value: Date | string | number | null | undefined): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

type YahooQuoteRaw = {
  symbol?: string;
  marketState?: string;
  regularMarketPrice?: unknown;
  regularMarketTime?: Date | string | number;
  regularMarketChange?: unknown;
  regularMarketChangePercent?: unknown;
  regularMarketPreviousClose?: unknown;
  preMarketPrice?: unknown;
  preMarketTime?: Date | string | number;
  postMarketPrice?: unknown;
  postMarketTime?: Date | string | number;
  extendedMarketPrice?: unknown;
  extendedMarketTime?: Date | string | number;
};

function sessionMark(
  state: MarketState,
  raw: YahooQuoteRaw,
): { price: number | null; asOf: string | null } {
  const regularPrice = num(raw.regularMarketPrice);
  const regularAsOf = toIso(raw.regularMarketTime);
  const extendedPrice = num(raw.extendedMarketPrice);
  const extendedAsOf = toIso(raw.extendedMarketTime);

  switch (state) {
    case "PRE":
    case "PREPRE":
      return {
        price: num(raw.preMarketPrice) ?? extendedPrice ?? regularPrice,
        asOf: toIso(raw.preMarketTime) ?? extendedAsOf ?? regularAsOf,
      };
    case "POST":
    case "POSTPOST":
      return {
        price: num(raw.postMarketPrice) ?? extendedPrice ?? regularPrice,
        asOf: toIso(raw.postMarketTime) ?? extendedAsOf ?? regularAsOf,
      };
    case "REGULAR":
    case "CLOSED":
    case "UNKNOWN":
      return {
        price: regularPrice ?? extendedPrice,
        asOf: regularAsOf ?? extendedAsOf,
      };
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

/** Map a Yahoo quote payload onto the session last sale vs previous close. */
export function liveQuoteFromYahoo(
  raw: YahooQuoteRaw,
  fallbackSymbol = "",
): LiveQuote | null {
  const marketState = toMarketState(raw.marketState);
  const { price, asOf } = sessionMark(marketState, raw);
  if (price == null) return null;
  const previousClose = num(raw.regularMarketPreviousClose);
  const change =
    previousClose == null ? num(raw.regularMarketChange) : price - previousClose;
  const changePct =
    previousClose != null && previousClose !== 0
      ? ((price - previousClose) / previousClose) * 100
      : num(raw.regularMarketChangePercent);
  return {
    symbol: (raw.symbol ?? fallbackSymbol).toUpperCase(),
    price,
    asOf,
    marketState,
    change,
    changePct,
    previousClose,
    source: "yahoo",
  };
}

function quotesFromYahooResult(
  result: unknown,
  fallbackSymbol: string,
): LiveQuote[] {
  const rows = Array.isArray(result) ? result : [result];
  return rows.flatMap((row) => {
    if (row == null || typeof row !== "object") return [];
    const quote = liveQuoteFromYahoo(row as YahooQuoteRaw, fallbackSymbol);
    return quote ? [quote] : [];
  });
}

/** Delayed last sale. Do not persist into market_bars. */
export async function fetchYahooQuotes(
  symbols: string[],
): Promise<LiveQuote[]> {
  const unique = [
    ...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)),
  ];
  if (unique.length === 0) return [];

  const query = unique.length === 1 ? unique[0]! : unique;
  try {
    const result = await yahooFinance.quote(query, {}, { validateResult: false });
    return quotesFromYahooResult(result, unique[0]!);
  } catch (error) {
    console.error("Batch live quotes failed; retrying per symbol", error);
  }

  const settled = await Promise.allSettled(
    unique.map((symbol) =>
      yahooFinance.quote(symbol, {}, { validateResult: false }),
    ),
  );
  return settled.flatMap((result, index) => {
    if (result.status === "rejected") {
      console.error(
        `Live quote unavailable for ${unique[index]}`,
        result.reason,
      );
      return [];
    }
    return quotesFromYahooResult(result.value, unique[index]!);
  });
}

type FundamentalsRow = Record<string, unknown> & { date?: Date | string };

function firstNumber(
  row: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = num(row[key]);
    if (value != null) return value;
  }
  return null;
}

/** Map one Yahoo fundamentalsTimeSeries row onto PowerFund quarterly fields. */
export function fundamentalsFromYahooRow(
  row: FundamentalsRow,
  existing?: QuarterlyFundamentals,
): QuarterlyFundamentals | null {
  const periodEnd = toDateOnly(row.date) ?? existing?.periodEnd ?? null;
  if (!periodEnd) return null;

  const revenue = firstNumber(row, [
    "quarterlyTotalRevenue",
    "quarterlyOperatingRevenue",
    "totalRevenue",
    "operatingRevenue",
  ]);
  const fcf = firstNumber(row, ["quarterlyFreeCashFlow", "freeCashFlow"]);
  const capexRaw = firstNumber(row, [
    "quarterlyCapitalExpenditure",
    "quarterlyPurchaseOfPPE",
    "capitalExpenditure",
    "purchaseOfPPE",
  ]);
  const capex = capexRaw == null ? null : Math.abs(capexRaw);
  const totalDebt = firstNumber(row, ["quarterlyTotalDebt", "totalDebt"]);
  const cash = firstNumber(row, [
    "quarterlyCashAndCashEquivalents",
    "quarterlyCashCashEquivalentsAndShortTermInvestments",
    "cashAndCashEquivalents",
    "cashCashEquivalentsAndShortTermInvestments",
  ]);
  const netDebt =
    totalDebt != null && cash != null ? totalDebt - cash : null;
  const shares = firstNumber(row, [
    "quarterlyShareIssued",
    "quarterlyOrdinarySharesNumber",
    "shareIssued",
    "ordinarySharesNumber",
    "dilutedAverageShares",
  ]);

  return {
    periodEnd,
    fiscalPeriod: existing?.fiscalPeriod ?? null,
    // Yahoo publishes period ends, never filing dates. Keep an SEC filing date
    // if this row is filling holes in one; otherwise the date must be estimated.
    filedAt: existing?.filedAt ?? null,
    revenue: revenue ?? existing?.revenue ?? null,
    freeCashFlow: fcf ?? existing?.freeCashFlow ?? null,
    capex: capex ?? existing?.capex ?? null,
    netDebt: netDebt ?? existing?.netDebt ?? null,
    sharesDiluted: shares ?? existing?.sharesDiluted ?? null,
    currency: existing?.currency ?? "USD",
    source: "yahoo",
    raw: { ...(existing?.raw ?? {}), ...row },
  };
}

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
    const next = fundamentalsFromYahooRow(row, byPeriod.get(periodEnd));
    if (next) byPeriod.set(periodEnd, next);
  }

  return [...byPeriod.values()].sort((a, b) =>
    a.periodEnd < b.periodEnd ? 1 : -1,
  );
}
