import { assessBarsFreshness } from "./bars-freshness";
import { roundQuantity } from "./money";

/**
 * Stock splits, and the one convention that keeps them from fabricating a
 * return.
 *
 * **Prices are stored on the vendor's current share basis; quantities are
 * normalised to that same basis when they are read.** Yahoo, Tiingo and Stooq
 * all restate the whole history of a series when a split takes effect, and
 * ingest refetches the series in full when it sees that (`detectPriceRebase`).
 * So `market_bars` is always split-adjusted to today. The ledger is not, and
 * must not be: a fill of 2.28 shares at $1,742.46 is what happened and stays
 * that way.
 *
 * The two meet here. A ledger quantity booked before a split's effective
 * session is multiplied by that split's ratio (and its per-share price divided
 * by it) at read time, which puts it on the basis the bars are on. Nothing is
 * rewritten, no trade is invented, and cash and cost basis never move — a
 * split changes how many pieces the same money is cut into, nothing else.
 *
 * Sandisk split eight-for-one in November 2026 with none of this in place. The
 * vendor restated five years of SNDK closes, the snapshot job multiplied the
 * new $94 close by the old 2.28 shares, and the book reported a $1,500 loss
 * that never happened — in every snapshot back to the October fill, because
 * the whole NAV series is rebuilt from the ledger each night.
 */

export type StockSplit = {
  instrumentId: string;
  /** First session that trades on the new basis (the ex-date). */
  effectiveDate: string;
  /** New shares per `denominator` old shares. 8-for-1 is 8 / 1; 1-for-10 is 1 / 10. */
  numerator: number;
  denominator: number;
};

export type SplitRatio = { numerator: number; denominator: number };

export function splitRatioLabel(split: SplitRatio): string {
  return `${split.numerator}-for-${split.denominator}`;
}

/**
 * What a quantity booked on `session` must be multiplied by to sit on the
 * current share basis: the product of every split that took effect after it.
 *
 * A fill on the effective date itself already traded on the new basis, so only
 * splits strictly after the session count. Numerators and denominators are
 * multiplied separately and divided once, so a 3-for-2 followed by a 2-for-3
 * comes back to exactly 1 rather than 0.9999999999999999.
 */
export function splitFactorAfter(
  splits: readonly StockSplit[],
  instrumentId: string | null,
  session: string,
): number {
  if (instrumentId == null) return 1;
  let numerator = 1;
  let denominator = 1;
  for (const split of splits) {
    if (split.instrumentId !== instrumentId) continue;
    if (split.effectiveDate <= session) continue;
    numerator *= split.numerator;
    denominator *= split.denominator;
  }
  return numerator / denominator;
}

/** Units on the current basis, at the 8 decimals the book stores. */
export function unitsOnCurrentBasis(quantity: number, factor: number): number {
  return factor === 1 ? quantity : roundQuantity(quantity * factor);
}

/** A per-share figure on the current basis. Full precision; round at the edge. */
export function perShareOnCurrentBasis(value: number, factor: number): number {
  return factor === 1 ? value : value / factor;
}

/**
 * Restate ledger rows on the current share basis.
 *
 * Every reader that multiplies a ledger quantity by a stored close has to go
 * through this first — the snapshot rebuild and the contribution report today.
 * `sessionOf` is the same rule the rest of the system uses to place a booking
 * in a session (`fillSessionDate`); it is passed in rather than imported so the
 * split boundary can never use a different rule from the flows and the marks.
 *
 * Cash, cost basis and realised P&L are untouched: they are dollars, and a
 * split does not change dollars.
 */
export function ledgerOnCurrentBasis<
  T extends {
    occurredAt: string;
    instrumentId: string | null;
    quantity: number | null;
    price?: number | null;
  },
>(
  entries: readonly T[],
  splits: readonly StockSplit[],
  sessionOf: (occurredAt: string) => string,
): T[] {
  if (splits.length === 0) return [...entries];
  return entries.map((entry) => {
    if (entry.instrumentId == null || entry.quantity == null) return entry;
    const factor = splitFactorAfter(
      splits,
      entry.instrumentId,
      sessionOf(entry.occurredAt),
    );
    if (factor === 1) return entry;
    const restated: T = {
      ...entry,
      quantity: unitsOnCurrentBasis(entry.quantity, factor),
    };
    if (entry.price != null) {
      restated.price = perShareOnCurrentBasis(entry.price, factor);
    }
    return restated;
  });
}

/**
 * A caution for free text that quotes per-share figures and was written
 * before a split: a dossier's value per share, a planned action's "buy below
 * $1,800", an invalidation level.
 *
 * Structured numbers are restated; prose cannot be, and must not be — a
 * dossier version is a record of what was believed on the day, at the prices
 * of the day. So the text is left exactly as written and this travels beside
 * it, giving the reader the factor instead of pretending the words changed.
 * Returns null when nothing has split since.
 */
export function priceBasisNote(
  splits: readonly StockSplit[],
  instrumentId: string | null,
  writtenSession: string,
  subject: string,
): string | null {
  if (instrumentId == null) return null;
  const since = splits
    .filter(
      (split) =>
        split.instrumentId === instrumentId && split.effectiveDate > writtenSession,
    )
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  if (since.length === 0) return null;
  const factor = splitFactorAfter(splits, instrumentId, writtenSession);
  const events = since
    .map((split) => `${splitRatioLabel(split)} effective ${split.effectiveDate}`)
    .join(", then ");
  const convert =
    factor >= 1
      ? `divide by ${Number(factor.toFixed(6))}`
      : `multiply by ${Number((1 / factor).toFixed(6))}`;
  return (
    `${subject} was written on ${writtenSession}, before a split (${events}). ` +
    `Per-share figures in it (prices, value per share, EPS) are on the old share basis: ` +
    `${convert} to compare with current prices. Dollar amounts are unaffected.`
  );
}

/**
 * Ratios companies actually use. A measured price ratio is snapped to one of
 * these or to nothing: 7.8 is an eight-for-one seen through an intraday fill,
 * 1.37 is a bad day.
 */
const COMMON_SPLITS: readonly SplitRatio[] = [
  { numerator: 5, denominator: 4 },
  { numerator: 4, denominator: 3 },
  { numerator: 3, denominator: 2 },
  { numerator: 2, denominator: 1 },
  { numerator: 5, denominator: 2 },
  { numerator: 3, denominator: 1 },
  { numerator: 4, denominator: 1 },
  { numerator: 5, denominator: 1 },
  { numerator: 6, denominator: 1 },
  { numerator: 7, denominator: 1 },
  { numerator: 8, denominator: 1 },
  { numerator: 10, denominator: 1 },
  { numerator: 15, denominator: 1 },
  { numerator: 20, denominator: 1 },
  { numerator: 25, denominator: 1 },
  { numerator: 30, denominator: 1 },
  { numerator: 40, denominator: 1 },
  { numerator: 50, denominator: 1 },
  { numerator: 100, denominator: 1 },
];

/**
 * The split a price ratio implies, if it implies one.
 *
 * `priceRatio` is old price ÷ new price, so 8 means a forward 8-for-1 and
 * 0.1 a reverse 1-for-10. `tolerancePct` is how far the measurement may sit
 * from the clean ratio: tight for a rebase measured close-to-close on the same
 * session, looser for a fill compared with its day's range.
 */
export function impliedSplit(
  priceRatio: number,
  tolerancePct = 1,
): SplitRatio | null {
  if (!Number.isFinite(priceRatio) || priceRatio <= 0) return null;
  const tolerance = tolerancePct / 100;
  let best: { split: SplitRatio; error: number } | null = null;
  for (const forward of COMMON_SPLITS) {
    const candidates: SplitRatio[] = [
      forward,
      { numerator: forward.denominator, denominator: forward.numerator },
    ];
    for (const split of candidates) {
      const error = Math.abs(
        priceRatio / (split.numerator / split.denominator) - 1,
      );
      if (error > tolerance) continue;
      if (best == null || error < best.error) best = { split, error };
    }
  }
  return best?.split ?? null;
}

export type CorporateActionStatus = "pending" | "applied" | "rejected";

/** How a split came to our attention. Only `manual` is a human's statement. */
export type CorporateActionSource = "vendor_event" | "price_rebase" | "manual";

export type KnownSplit = SplitRatio & {
  id: string;
  status: CorporateActionStatus;
  effectiveDate: string;
  source: CorporateActionSource;
};

export type DetectedSplit = SplitRatio & {
  effectiveDate: string;
  source: Exclude<CorporateActionSource, "manual">;
};

export type DetectedSplitPlan =
  | { action: "insert" }
  | { action: "update"; id: string }
  | { action: "ignore"; reason: string };

/** Two sightings this close together, with the same ratio, are one split. */
const SAME_EVENT_DAYS = 10;

function daysApart(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

/**
 * What ingest should do with a split it has just noticed.
 *
 * Ingest sees the same split many times and from two directions: as a vendor
 * event carrying the real ex-date, and as the price series changing under us,
 * which only says "around now". Neither may register the split twice, and
 * neither may resurrect one the operator already applied or rejected — a
 * second row for the same event is exactly how a position gets multiplied by
 * eight twice.
 *
 * The only upgrade allowed is a vendor event correcting the date on a pending
 * row that a price rebase opened, because the event knows the ex-date and the
 * rebase guessed it. An applied row is never touched.
 */
export function planDetectedSplit(
  known: readonly KnownSplit[],
  detected: DetectedSplit,
): DetectedSplitPlan {
  const sameEvent = known.filter(
    (row) =>
      row.numerator * detected.denominator ===
        detected.numerator * row.denominator &&
      daysApart(row.effectiveDate, detected.effectiveDate) <= SAME_EVENT_DAYS,
  );
  const settled = sameEvent.find((row) => row.status !== "pending");
  if (settled != null) {
    return {
      action: "ignore",
      reason: `already ${settled.status} (effective ${settled.effectiveDate})`,
    };
  }
  const pending = sameEvent[0];
  if (pending != null) {
    if (
      detected.source === "vendor_event" &&
      pending.source === "price_rebase" &&
      pending.effectiveDate !== detected.effectiveDate
    ) {
      return { action: "update", id: pending.id };
    }
    return { action: "ignore", reason: "already pending" };
  }
  // A different split is still waiting on the operator. Opening a second
  // pending row for the same name would ask them to pick between two guesses.
  const otherPending = known.find((row) => row.status === "pending");
  if (otherPending != null && detected.source === "price_rebase") {
    return {
      action: "ignore",
      reason: `a ${splitRatioLabel(otherPending)} split is already pending`,
    };
  }
  return { action: "insert" };
}

export type FillBasisInput = {
  symbol: string;
  /** Session the fill was booked in. */
  session: string;
  /** Fill price already restated on the current basis. */
  price: number;
  /** That session's stored bar, if we hold one. */
  bar: { low: number | null; high: number | null; close: number | null } | null;
};

export type FillBasisMismatch = {
  symbol: string;
  session: string;
  fillPrice: number;
  /** The end of the session's range the fill is nearest to. */
  referencePrice: number;
  /** fillPrice ÷ referencePrice. Far from 1 means the two are on different bases. */
  ratio: number;
  /** The unregistered split that would explain it, if a common ratio fits. */
  implied: SplitRatio | null;
};

/**
 * Fills that cannot have happened at the prices we store for their session.
 *
 * This is the stored-data invariant behind the whole convention: a real fill
 * sits inside, or very near, its session's range. When the fill is eight times
 * the day's high, the ledger and the bars are on different share bases — a
 * split the vendor has applied and we have not, or one we applied and the
 * vendor has not. It is checked on the data rather than on the event feed
 * because the event feed is what failed: Yahoo restated SNDK without yet
 * publishing a split event, so the only evidence was the disagreement itself.
 *
 * It names a suspect and an implied ratio; it never applies one. A booking a
 * day late or a gap open can trip it, and a human reading "SNDK fill is 7.8x
 * its session high" knows which it is.
 */
export function fillBasisMismatches(
  fills: readonly FillBasisInput[],
  options?: { tolerance?: number },
): FillBasisMismatch[] {
  const tolerance = options?.tolerance ?? 1.2;
  const out: FillBasisMismatch[] = [];
  for (const fill of fills) {
    if (fill.bar == null || !(fill.price > 0)) continue;
    const high = fill.bar.high ?? fill.bar.close;
    const low = fill.bar.low ?? fill.bar.close;
    if (high == null || low == null || !(high > 0) || !(low > 0)) continue;
    let reference: number | null = null;
    if (fill.price > high * tolerance) reference = high;
    else if (fill.price < low / tolerance) reference = low;
    if (reference == null) continue;
    const ratio = fill.price / reference;
    out.push({
      symbol: fill.symbol,
      session: fill.session,
      fillPrice: fill.price,
      referencePrice: reference,
      ratio,
      // A fill is compared with the edge of a range, not the same print, so the
      // match is loose. It is a hint for the operator, not an instruction.
      implied: impliedSplit(ratio, 12),
    });
  }
  return out;
}

export type PendingCorporateAction = SplitRatio & {
  symbol: string;
  effectiveDate: string;
  source: CorporateActionSource;
  /** Whether the book holds the name. A watchlist split still matters for research. */
  held: boolean;
};

export type BookIntegrity = {
  /** Session the store should have reached. */
  expectedSession: string;
  /** Latest session any open holding reaches — what `price_data_through` publishes. */
  holdingsThrough: string | null;
  /** Open holdings with no close for `expectedSession`. */
  missingCloses: Array<{ symbol: string; through: string | null }>;
  /** Splits registered and not yet applied or rejected. */
  pendingCorporateActions: PendingCorporateAction[];
  /** Fills that disagree with their session's stored prices by a split-sized factor. */
  basisMismatches: FillBasisMismatch[];
  /** True when the closes are not all current. */
  stale: boolean;
  /**
   * True when NAV, returns, drawdown and risk are not fit to act on: a held
   * name is missing its close, or is on the wrong share basis.
   */
  provisional: boolean;
  warnings: string[];
};

/**
 * Is the valuation on screen one a deployment decision may lean on?
 *
 * `price_data_stale` used to read the *newest* holding session, so it stayed
 * false on 19 November 2026 while six of twelve holdings were marked from the
 * day before — and said nothing at all about a holding marked at an eighth of
 * its value. Freshness is coverage across every open position, and correctness
 * of the share basis is a separate question from freshness; both are answered
 * here, by name, so the consumer can say which number is wrong and why.
 *
 * A pending split on a name we do not hold is reported but does not make the
 * book provisional: it distorts that name's research, not NAV.
 */
export function assessBookIntegrity(input: {
  benchmarkThrough: string | null;
  holdings: ReadonlyArray<{ symbol: string; through: string | null }>;
  pendingCorporateActions: readonly PendingCorporateAction[];
  basisMismatches: readonly FillBasisMismatch[];
  asOf?: string;
}): BookIntegrity {
  const freshness = assessBarsFreshness({
    benchmarkThrough: input.benchmarkThrough,
    holdings: input.holdings,
    asOf: input.asOf,
  });
  const heldPending = input.pendingCorporateActions.filter((row) => row.held);
  const warnings: string[] = [];

  if (freshness.behind.length > 0) {
    warnings.push(
      `No close for ${freshness.expectedSession}: ` +
        freshness.behind
          .map((row) => `${row.symbol} (last ${row.through ?? "none"})`)
          .join(", ") +
        " — marked from an older close.",
    );
  }
  for (const action of input.pendingCorporateActions) {
    warnings.push(
      `${action.symbol} ${splitRatioLabel(action)} split effective ${action.effectiveDate} ` +
        `is registered but not applied (${action.source})` +
        (action.held
          ? " — its quantity and the stored prices may be on different share bases."
          : " — per-share research figures predate it."),
    );
  }
  for (const mismatch of input.basisMismatches) {
    warnings.push(
      `${mismatch.symbol} fill on ${mismatch.session} is ${mismatch.ratio.toFixed(2)}x that session's stored range` +
        (mismatch.implied == null
          ? " — ledger and prices disagree."
          : ` — looks like an unreconciled ${splitRatioLabel(mismatch.implied)} split.`),
    );
  }

  return {
    expectedSession: freshness.expectedSession,
    holdingsThrough: freshness.holdingsThrough,
    missingCloses: freshness.behind,
    pendingCorporateActions: [...input.pendingCorporateActions],
    basisMismatches: [...input.basisMismatches],
    stale: freshness.stale,
    provisional:
      freshness.behind.length > 0 ||
      heldPending.length > 0 ||
      input.basisMismatches.length > 0,
    warnings,
  };
}
