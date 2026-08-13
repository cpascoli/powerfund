/**
 * Money helpers for the transactions ledger.
 *
 * The ledger stores `cash_delta` as numeric(20,2) because real accounts settle
 * in whole cents, and derives cost basis from cash moved rather than from
 * price x quantity. Fees are capitalised into basis on a buy and deducted from
 * proceeds on a sell, which is the correct treatment for UK CGT.
 */

/** Rounds to whole cents, avoiding the float error in naive `toFixed` chains. */
export function toCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
