/**
 * Money helpers for the transactions ledger.
 *
 * The ledger stores `cash_delta` as numeric(20,2) because real accounts settle
 * in whole cents, and derives cost basis from cash moved rather than from
 * price x quantity. Fees are capitalised into basis on a buy and deducted from
 * proceeds on a sell, which is the correct treatment for UK CGT.
 */

/**
 * The single currency the book is denominated in. Positions, cash, NAV and every
 * mandate cap assume it; there is no FX conversion anywhere in the system, so a
 * listing in any other currency cannot be booked.
 */
export const BOOK_CURRENCY = "USD";

/** Rounds to whole cents, avoiding the float error in naive `toFixed` chains. */
export function toCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Rounds to the 8 decimals `positions.quantity` and `transactions.quantity` store. */
export function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 1e8) / 1e8;
}

/**
 * Half away from zero. `Math.round` sends n.5 toward +∞, which would turn
 * −10.15% into −10.1 instead of −10.2.
 */
export function roundHalfAwayFromZero(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const shifted = value * factor;
  const sign = shifted < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(shifted))) / factor;
}

/** Decimal return (0.012) → 1-decimal percent (1.2). */
export function fractionToPercent(value: number): number {
  return roundHalfAwayFromZero(value * 100, 1);
}

/** Already-percent value rounded to 1 decimal. */
export function roundPercent(value: number): number {
  return roundHalfAwayFromZero(value, 1);
}

/** Signed cash effect of a buy: negative, and inclusive of fees. */
export function buyCashDelta(
  quantity: number,
  price: number,
  fees = 0,
): number {
  return -toCents(quantity * price + fees);
}

/** Signed cash effect of a sell: positive, net of fees. */
export function sellCashDelta(
  quantity: number,
  price: number,
  fees = 0,
): number {
  return toCents(quantity * price - fees);
}

/**
 * Realized P&L under average cost pooling: net proceeds less the pooled cost of
 * the units sold. The database computes the authoritative value from the
 * position's average cost at the time of the sale; this mirrors it so the UI can
 * preview an exit before it is booked.
 */
export function previewRealizedPnl(args: {
  quantity: number;
  price: number;
  avgCost: number;
  fees?: number;
}): number {
  const proceeds = sellCashDelta(args.quantity, args.price, args.fees ?? 0);
  return toCents(proceeds - args.quantity * args.avgCost);
}
