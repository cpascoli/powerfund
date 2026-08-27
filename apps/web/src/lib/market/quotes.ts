import { fetchYahooQuotes, type LiveQuote } from "@powerfund/data-clients";

import type { PricePoint } from "@/lib/market/returns";

export type { LiveQuote };

const NY_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function newYorkDate(value: Date | string): string {
  return NY_DATE.format(value instanceof Date ? value : new Date(value));
}

export async function getLiveQuote(symbol: string): Promise<LiveQuote | null> {
  try {
    const quotes = await fetchYahooQuotes([symbol]);
    return quotes[0] ?? null;
  } catch (error) {
    console.error(`Live quote unavailable for ${symbol}`, error);
    return null;
  }
}

export function quoteCaption(quote: LiveQuote | null): string {
  if (quote == null) return "Close";
  switch (quote.marketState) {
    case "REGULAR":
      return "Delayed";
    case "PRE":
    case "PREPRE":
      return "Pre-market";
    case "POST":
    case "POSTPOST":
      return "After-hours";
    case "CLOSED":
      return "Last";
    case "UNKNOWN":
      return "Delayed";
    default: {
      const _exhaustive: never = quote.marketState;
      return _exhaustive;
    }
  }
}

/** True while a US tape (regular or extended) can still move the last sale. */
export function isTapeActive(state: LiveQuote["marketState"]): boolean {
  switch (state) {
    case "REGULAR":
    case "PRE":
    case "PREPRE":
    case "POST":
    case "POSTPOST":
    case "UNKNOWN":
      return true;
    case "CLOSED":
      return false;
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

/**
 * Paint the delayed last sale as the latest daily point. Uses the quote's
 * session date in America/New_York so a live print becomes "today" during
 * regular hours, and a stale ingest still shows today's close after the bell.
 * Does not write market_bars.
 */
export function overlayLiveQuote(
  points: PricePoint[],
  quote: LiveQuote | null,
): { points: PricePoint[]; live: boolean } {
  if (quote == null || points.length === 0) {
    return { points, live: false };
  }

  const date = quote.asOf
    ? newYorkDate(quote.asOf)
    : quote.marketState === "REGULAR" || quote.marketState === "POST"
      ? newYorkDate(new Date())
      : null;
  if (date == null) return { points, live: false };

  const last = points[points.length - 1]!;
  if (last.date > date) return { points, live: false };

  const next: PricePoint = { date, close: quote.price };
  if (last.date === date) {
    if (last.close === quote.price) return { points, live: false };
    return { points: [...points.slice(0, -1), next], live: true };
  }

  return { points: [...points, next], live: true };
}
