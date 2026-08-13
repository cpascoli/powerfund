import { fetchYahooQuotes, type LiveQuote } from "@powerfund/data-clients";

export type { LiveQuote };

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
