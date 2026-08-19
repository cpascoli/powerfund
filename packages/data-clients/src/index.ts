import { fetchSecQuarterlyFundamentals } from "./sec";
import { fetchStooqDailyBars } from "./stooq";
import { fetchTiingoDailyBars } from "./tiingo";
import type { DailyBar, QuarterlyFundamentals } from "./types";
import {
  fetchYahooDailyBars,
  fetchYahooMarketCap,
  fetchYahooQuarterlyFundamentals,
} from "./yahoo";

export type {
  DailyBar,
  LiveQuote,
  MarketCapPoint,
  MarketState,
  QuarterlyFundamentals,
} from "./types";
export { fetchTiingoDailyBars } from "./tiingo";
export { fetchStooqDailyBars } from "./stooq";
export { fetchSecQuarterlyFundamentals } from "./sec";
export {
  fetchYahooDailyBars,
  fetchYahooMarketCap,
  fetchYahooQuarterlyFundamentals,
  fetchYahooQuotes,
} from "./yahoo";

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch daily bars with free-tier vendor fallback chain. */
export async function fetchDailyBars(args: {
  symbol: string;
  startDate: string;
  endDate?: string;
  tiingoApiKey?: string | null;
}): Promise<{ bars: DailyBar[]; source: string }> {
  const errors: string[] = [];

  if (args.tiingoApiKey) {
    try {
      const bars = await fetchTiingoDailyBars({
        symbol: args.symbol,
        apiKey: args.tiingoApiKey,
        startDate: args.startDate,
        endDate: args.endDate,
      });
      if (bars.length > 0) {
        return { bars, source: "tiingo" };
      }
      errors.push("tiingo: empty");
    } catch (error) {
      errors.push(
        `tiingo: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  try {
    const bars = await fetchYahooDailyBars({
      symbol: args.symbol,
      startDate: args.startDate,
      endDate: args.endDate,
    });
    if (bars.length > 0) {
      return { bars, source: "yahoo" };
    }
    errors.push("yahoo: empty");
  } catch (error) {
    errors.push(
      `yahoo: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const bars = await fetchStooqDailyBars({
      symbol: args.symbol,
      startDate: args.startDate,
      endDate: args.endDate,
    });
    if (bars.length > 0) {
      return { bars, source: "stooq" };
    }
    errors.push("stooq: empty");
  } catch (error) {
    errors.push(
      `stooq: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  throw new Error(
    `No daily bars for ${args.symbol}. Tried: ${errors.join(" | ")}`,
  );
}

const FUNDAMENTALS_ALIGN_MS = 7 * 24 * 60 * 60 * 1000;

function periodMs(periodEnd: string): number {
  return Date.parse(`${periodEnd}T00:00:00Z`);
}

function nearestQuarter(
  periodEnd: string,
  rows: QuarterlyFundamentals[],
): QuarterlyFundamentals | null {
  const target = periodMs(periodEnd);
  let best: QuarterlyFundamentals | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const dist = Math.abs(periodMs(row.periodEnd) - target);
    if (dist <= FUNDAMENTALS_ALIGN_MS && dist < bestDist) {
      best = row;
      bestDist = dist;
    }
  }
  return best;
}

function isSparseQuarter(row: QuarterlyFundamentals): boolean {
  return (
    row.freeCashFlow == null || row.capex == null || row.netDebt == null
  );
}

function fillSparseQuarter(
  primary: QuarterlyFundamentals,
  filler: QuarterlyFundamentals,
): QuarterlyFundamentals {
  const filled =
    (primary.freeCashFlow == null && filler.freeCashFlow != null) ||
    (primary.capex == null && filler.capex != null) ||
    (primary.netDebt == null && filler.netDebt != null) ||
    (primary.sharesDiluted == null && filler.sharesDiluted != null);
  if (!filled) return primary;
  return {
    ...primary,
    freeCashFlow: primary.freeCashFlow ?? filler.freeCashFlow,
    capex: primary.capex ?? filler.capex,
    netDebt: primary.netDebt ?? filler.netDebt,
    sharesDiluted: primary.sharesDiluted ?? filler.sharesDiluted,
    source: `${primary.source}+yahoo`,
    raw: { sec: primary.raw, yahoo: filler.raw },
  };
}

function mergeSecAndYahoo(
  secRows: QuarterlyFundamentals[],
  yahooRows: QuarterlyFundamentals[],
): QuarterlyFundamentals[] {
  const merged = secRows.map((row) => {
    if (!isSparseQuarter(row)) return row;
    const yahoo = nearestQuarter(row.periodEnd, yahooRows);
    return yahoo ? fillSparseQuarter(row, yahoo) : row;
  });
  for (const yahoo of yahooRows) {
    if (nearestQuarter(yahoo.periodEnd, secRows) != null) continue;
    merged.push(yahoo);
  }
  return merged.sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1));
}

function vendorError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Fetch quarterly fundamentals with free-tier vendor fallback chain. */
export async function fetchQuarterlyFundamentals(args: {
  symbol: string;
}): Promise<{ rows: QuarterlyFundamentals[]; source: string }> {
  const errors: string[] = [];
  let secRows: QuarterlyFundamentals[] = [];
  let yahooRows: QuarterlyFundamentals[] = [];

  try {
    secRows = await fetchSecQuarterlyFundamentals(args.symbol);
    if (secRows.length === 0) errors.push("sec: empty");
  } catch (error) {
    errors.push(`sec: ${vendorError(error)}`);
  }

  try {
    yahooRows = await fetchYahooQuarterlyFundamentals(args.symbol);
    if (yahooRows.length === 0) errors.push("yahoo: empty");
  } catch (error) {
    errors.push(`yahoo: ${vendorError(error)}`);
  }

  if (secRows.length > 0 && yahooRows.length > 0) {
    return { rows: mergeSecAndYahoo(secRows, yahooRows), source: "sec+yahoo" };
  }
  if (secRows.length > 0) {
    return { rows: secRows, source: "sec" };
  }
  if (yahooRows.length > 0) {
    return { rows: yahooRows, source: "yahoo" };
  }

  throw new Error(
    `No fundamentals for ${args.symbol}. Tried: ${errors.join(" | ")}`,
  );
}
