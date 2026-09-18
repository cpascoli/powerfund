import { lastCompletedCashSession, priceDataStale } from "./dates";

export type BarsFreshnessInput = {
  /** Latest stored SPY session. */
  benchmarkThrough: string | null;
  /** Latest stored session for each open holding. */
  holdings: ReadonlyArray<{ symbol: string; through: string | null }>;
  asOf?: string;
};

export type BarsFreshness = {
  /** Session the store should have reached by `asOf`. */
  expectedSession: string;
  benchmarkThrough: string | null;
  /** Latest holding session — the figure `getPortfolio` publishes as `price_data_through`. */
  holdingsThrough: string | null;
  /** Every open holding whose newest bar predates `expectedSession`. */
  behind: Array<{ symbol: string; through: string | null }>;
  stale: boolean;
};

/**
 * Has ingest actually reached the last completed cash session?
 *
 * Two conditions fail independently, so both are checked. SPY's bars are the
 * trading calendar: without its session the snapshot cannot key a row at all.
 * A holding missing its own bar is marked from an older close instead, which is
 * how a green ingest run still leaves the book a day behind — the vendor served
 * a window that stopped short of the session that had already closed.
 *
 * `stale` is deliberately stricter than `getPortfolio.price_data_stale`, which
 * reads the *latest* holding session and therefore says nothing while a single
 * position lags. A gate that decides whether to re-ingest should fire on one
 * lagging name, because that name is what the briefing quotes.
 *
 * Weekends only: `lastCompletedCashSession` has no holiday calendar, so this
 * reports stale all day on a US market holiday. Read it as "another pass is
 * cheap", never as "something is broken".
 */
export function assessBarsFreshness(input: BarsFreshnessInput): BarsFreshness {
  const asOf = input.asOf ?? new Date().toISOString();
  const sessions = input.holdings
    .map((row) => row.through)
    .filter((value): value is string => value != null)
    .sort();
  const behind = input.holdings
    .filter((row) => priceDataStale(row.through, asOf))
    .map((row) => ({ symbol: row.symbol, through: row.through }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  return {
    expectedSession: lastCompletedCashSession(asOf),
    benchmarkThrough: input.benchmarkThrough,
    holdingsThrough: sessions.at(-1) ?? null,
    behind,
    stale: priceDataStale(input.benchmarkThrough, asOf) || behind.length > 0,
  };
}
