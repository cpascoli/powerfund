import type { LiveQuote, MarketState } from "@powerfund/data-clients";

import type { PricePoint } from "@/lib/market/returns";

export type QuoteSessionKind =
  | "before_market"
  | "after_market"
  | "daily_close"
  | "live";

export type QuoteDirection = "up" | "down" | "flat";

export type CompanyQuoteMark = {
  price: number;
  direction: QuoteDirection;
  session: QuoteSessionKind;
  /** Chip text: Before market, After market, Daily close, or Live price. */
  label: string;
  /** Formatted New York date and time of the print, when we have one. */
  asOfLabel: string | null;
  asOfIso: string | null;
};

const SESSION_LABEL: Record<QuoteSessionKind, string> = {
  before_market: "Before market",
  after_market: "After market",
  daily_close: "Daily close",
  live: "Live price",
};

const NY_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const NY_STAMP = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

const UTC_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

/**
 * A stored daily bar has a session date and no clock time. The cash close is
 * 16:00 America/New_York, which is when that price was set.
 */
function cashCloseLabel(ymd: string): string {
  const noon = new Date(`${ymd}T12:00:00Z`);
  if (Number.isNaN(noon.getTime())) return ymd;
  return `${UTC_DAY.format(noon)}, 4:00 PM ET`;
}

function formatInstant(iso: string): string | null {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;
  return NY_STAMP.format(instant);
}

function newYorkDate(iso: string): string | null {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;
  return NY_DATE.format(instant);
}

function sameCent(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

function directionOf(price: number, basis: number | null): QuoteDirection {
  if (basis == null || sameCent(price, basis)) return "flat";
  return price > basis ? "up" : "down";
}

export function quoteSessionKind(state: MarketState): QuoteSessionKind {
  switch (state) {
    case "PRE":
    case "PREPRE":
      return "before_market";
    case "POST":
    case "POSTPOST":
      return "after_market";
    case "REGULAR":
      return "live";
    case "CLOSED":
    case "UNKNOWN":
      return "daily_close";
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

function barBefore(bars: PricePoint[], date: string | null): number | null {
  if (date == null) {
    return bars.length >= 2 ? bars[bars.length - 2]!.close : null;
  }
  for (let i = bars.length - 1; i >= 0; i -= 1) {
    const bar = bars[i]!;
    if (bar.date < date) return bar.close;
  }
  return null;
}

function barOn(bars: PricePoint[], date: string | null): number | null {
  if (date == null) return null;
  for (let i = bars.length - 1; i >= 0; i -= 1) {
    const bar = bars[i]!;
    if (bar.date === date) return bar.close;
  }
  return null;
}

/**
 * The close the header color is measured against.
 *
 * Extended hours compare with today's cash close: an after-hours print above
 * yesterday and below the bell is down. Every other session compares with the
 * prior available daily close — the stored bar before this session when we
 * have one, otherwise the vendor's previous close.
 */
function basisClose(args: {
  quote: LiveQuote;
  bars: PricePoint[];
  session: QuoteSessionKind;
  sessionDate: string | null;
  price: number;
}): number | null {
  const { quote, bars, session, sessionDate, price } = args;
  if (session === "after_market") {
    const regular =
      quote.regularPrice != null && !sameCent(quote.regularPrice, price)
        ? quote.regularPrice
        : null;
    const stored = barOn(bars, sessionDate);
    const storedClose =
      stored != null && !sameCent(stored, price) ? stored : null;
    return regular ?? storedClose ?? quote.previousClose ?? barBefore(bars, sessionDate);
  }
  return (
    barBefore(bars, sessionDate) ??
    quote.previousClose
  );
}

export function companyQuoteMark(args: {
  quote: LiveQuote | null;
  bars: PricePoint[];
  lastClose: number | null;
}): CompanyQuoteMark | null {
  const { quote, bars, lastClose } = args;

  if (quote == null) {
    const price = lastClose ?? bars.at(-1)?.close ?? null;
    if (price == null) return null;
    const last = bars.at(-1) ?? null;
    const prior = bars.length >= 2 ? bars[bars.length - 2]!.close : null;
    const basis =
      last != null && !sameCent(last.close, price) ? last.close : prior;
    const date = last?.date ?? null;
    return {
      price,
      direction: directionOf(price, basis),
      session: "daily_close",
      label: SESSION_LABEL.daily_close,
      asOfLabel: date ? cashCloseLabel(date) : null,
      asOfIso: date,
    };
  }

  const session = quoteSessionKind(quote.marketState);
  const sessionDate = quote.asOf ? newYorkDate(quote.asOf) : (bars.at(-1)?.date ?? null);
  const basis = basisClose({
    quote,
    bars,
    session,
    sessionDate,
    price: quote.price,
  });
  const asOfLabel = quote.asOf
    ? formatInstant(quote.asOf)
    : session === "daily_close" && sessionDate
      ? cashCloseLabel(sessionDate)
      : null;

  return {
    price: quote.price,
    direction: directionOf(quote.price, basis),
    session,
    label: SESSION_LABEL[session],
    asOfLabel,
    asOfIso: quote.asOf ?? sessionDate,
  };
}
