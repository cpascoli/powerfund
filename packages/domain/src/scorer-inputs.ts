import type { FundamentalQuarter } from "./inflection";
import { latestVintagesAsOf, type VintageKey } from "./vintages";

/**
 * Assembling a scorer's inputs as they stood on a date.
 *
 * The live run and a historical replay must see the world through the same
 * function, or the backtest is measuring a different scorer from the one that
 * runs. So the worker loads an instrument's whole history once and slices it
 * here; "today" is just the last slice.
 */

export type QuarterVintage = FundamentalQuarter &
  VintageKey & {
    /** Currency the figures are reported in. Null when the vendor never said. */
    currency?: string | null;
  };

export type HistoricalBar = { date: string; close: number };

export type HistoricalCap = { date: string; marketCap: number };

export type InstrumentHistory = {
  vintages: readonly QuarterVintage[];
  /** Ascending by date. */
  bars: readonly HistoricalBar[];
  /** Ascending by date. */
  caps: readonly HistoricalCap[];
};

export type ScorerInputsAsOf = {
  quarters: FundamentalQuarter[];
  closes: number[];
  /** Last session with a bar for this name at `asOf`. Null when it had none. */
  lastBarDate: string | null;
  marketCap: number | null;
  /** Currency of the newest visible quarter. */
  fundamentalsCurrency: string | null;
  /**
   * False when the fundamentals and the market cap are in different currencies,
   * in which case `marketCap` is withheld rather than divided into net debt.
   */
  marketCapComparable: boolean;
};

/** Closes the scorer looks back over. */
export const SCORER_BAR_WINDOW = 400;

/**
 * What a scorer could have seen on `asOf`.
 *
 * Fundamentals come from the vintage series, so a restatement filed after
 * `asOf` is invisible and a quarter does not exist until it was filed. Prices
 * and market cap are cut at the same date. Nothing here reaches forward.
 */
export function sliceScorerInputsAsOf(
  history: InstrumentHistory,
  asOf: string,
  options?: { barWindow?: number; quoteCurrency?: string | null },
): ScorerInputsAsOf {
  const barWindow = options?.barWindow ?? SCORER_BAR_WINDOW;

  const visible = latestVintagesAsOf(history.vintages, asOf);
  const quarters = visible.map(
    (row): FundamentalQuarter => ({
      periodEnd: row.periodEnd,
      revenue: row.revenue,
      capex: row.capex,
      freeCashFlow: row.freeCashFlow,
      netDebt: row.netDebt,
      sharesDiluted: row.sharesDiluted,
      // The scorer reports how old its inputs are; when we observed a vintage
      // is the honest answer, not when the projection row was last touched.
      ingestedAt: row.observedAt,
    }),
  );

  const visibleBars: HistoricalBar[] = [];
  for (const bar of history.bars) {
    if (bar.date > asOf) break;
    visibleBars.push(bar);
  }
  const windowed = visibleBars.slice(-barWindow);

  let marketCap: number | null = null;
  for (const cap of history.caps) {
    if (cap.date > asOf) break;
    marketCap = cap.marketCap;
  }

  // A market cap is quoted in the currency the shares trade in; the financials
  // are reported in whatever the issuer reports in. SK hynix trades in USD and
  // reports in KRW, so net debt over market cap would be out by three orders of
  // magnitude and look like a balance sheet in crisis. Withhold it instead.
  const fundamentalsCurrency = visible.at(-1)?.currency ?? null;
  const quote = options?.quoteCurrency?.trim().toUpperCase() ?? null;
  const marketCapComparable =
    quote == null ||
    fundamentalsCurrency == null ||
    fundamentalsCurrency.toUpperCase() === quote;

  return {
    quarters,
    closes: windowed.map((bar) => bar.close),
    lastBarDate: windowed.at(-1)?.date ?? null,
    marketCap: marketCapComparable ? marketCap : null,
    fundamentalsCurrency,
    marketCapComparable,
  };
}

/**
 * Forward total return over the next `sessions` bars after `from`, or null when
 * the window has not elapsed. Used to grade what a setup was worth; never
 * available to the scorer itself.
 */
export function forwardReturn(
  bars: readonly HistoricalBar[],
  from: string,
  sessions: number,
): number | null {
  let index = -1;
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];
    if (bar == null || bar.date > from) break;
    index = i;
  }
  if (index < 0) return null;
  const start = bars[index];
  const end = bars[index + sessions];
  if (start == null || end == null || start.close <= 0) return null;
  return end.close / start.close - 1;
}
