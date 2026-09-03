export type DailyBar = {
  date: string; // YYYY-MM-DD
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  adjClose: number | null;
  volume: number | null;
  source: string;
};

export type MarketCapPoint = {
  asOfDate: string;
  marketCap: number;
  source: string;
};

export type MarketState =
  | "REGULAR"
  | "PRE"
  | "POST"
  | "CLOSED"
  | "PREPRE"
  | "POSTPOST"
  | "UNKNOWN";

/** Delayed last sale from Yahoo quote() — display overlay, not stored in market_bars. */
export type LiveQuote = {
  symbol: string;
  price: number;
  asOf: string | null;
  marketState: MarketState;
  change: number | null;
  changePct: number | null;
  previousClose: number | null;
  source: "yahoo";
};

export type QuarterlyFundamentals = {
  periodEnd: string;
  fiscalPeriod: string | null;
  /**
   * Filing date reported by the vendor, when there is one. SEC companyfacts
   * carries `filed` per fact; Yahoo publishes period ends only. Null means the
   * date must be estimated — see `resolveKnowableAt` in @powerfund/domain.
   */
  filedAt: string | null;
  revenue: number | null;
  freeCashFlow: number | null;
  capex: number | null;
  netDebt: number | null;
  sharesDiluted: number | null;
  /**
   * Currency the figures are reported in — not the currency the shares trade
   * in. Null when the vendor does not say; the ingest falls back to the book
   * currency and the row should be treated with suspicion.
   */
  currency: string | null;
  source: string;
  raw: Record<string, unknown>;
};
