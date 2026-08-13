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

/** Fetch quarterly fundamentals with free-tier vendor fallback chain. */
export async function fetchQuarterlyFundamentals(args: {
  symbol: string;
}): Promise<{ rows: QuarterlyFundamentals[]; source: string }> {
  const errors: string[] = [];

  try {
    const rows = await fetchSecQuarterlyFundamentals(args.symbol);
    if (rows.length > 0) {
      return { rows, source: "sec" };
    }
    errors.push("sec: empty");
  } catch (error) {
    errors.push(
      `sec: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const rows = await fetchYahooQuarterlyFundamentals(args.symbol);
    if (rows.length > 0) {
      return { rows, source: "yahoo" };
    }
    errors.push("yahoo: empty");
  } catch (error) {
    errors.push(
      `yahoo: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  throw new Error(
    `No fundamentals for ${args.symbol}. Tried: ${errors.join(" | ")}`,
  );
}
