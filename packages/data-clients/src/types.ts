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
  revenue: number | null;
  freeCashFlow: number | null;
  capex: number | null;
  netDebt: number | null;
  sharesDiluted: number | null;
  currency: string;
  source: string;
  raw: Record<string, unknown>;
};
