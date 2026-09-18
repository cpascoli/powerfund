import {
  BOOK_CURRENCY,
  bookCurrencyBlock,
  evaluateProposedBuy,
  formatMandateBlock,
  type MandateBook,
  type MandateViolation,
} from "@powerfund/domain";

import { getOpenPortfolioBook } from "@/lib/data/portfolio";
import { listInstrumentsWithThemes } from "@/lib/data/research";
import {
  computeDrawdown,
  listLedgerFlows,
  listPortfolioSnapshots,
} from "@/lib/data/snapshots";
import { resolveDb, type DbClient } from "@/lib/supabase/db";

export async function loadMandateBook(client?: DbClient): Promise<MandateBook> {
  const [book, snapshots, flows] = await Promise.all([
    getOpenPortfolioBook(client),
    listPortfolioSnapshots(365, client),
    listLedgerFlows(client),
  ]);
  const drawdown = computeDrawdown(
    snapshots,
    {
      nav: book.nav,
      invested: book.invested,
      positionsValue: book.marketValue,
    },
    flows,
  );
  return {
    nav: book.nav,
    cash: book.cash,
    invested: book.invested,
    killSwitchBreached: drawdown.killSwitchBreached,
    positions: book.positions.map((row) => ({
      symbol: row.symbol,
      themeSlug: row.themeSlug,
      marketValue: row.marketValue ?? row.costBasis,
      costBasis: row.costBasis,
    })),
  };
}

export async function lookupInstrumentTheme(
  instrumentId: string,
  client?: DbClient,
): Promise<{ symbol: string; themeSlug: string; currency: string } | null> {
  const instruments = await listInstrumentsWithThemes(client);
  const instrument = instruments.find((row) => row.id === instrumentId);
  if (!instrument) return null;
  return {
    symbol: instrument.symbol,
    themeSlug: instrument.theme_slug,
    currency: instrument.currency ?? BOOK_CURRENCY,
  };
}

/**
 * Which side of the book the caller is proposing. Required, not defaulted: every
 * mandate rule below is a rule about *adding* risk, and a caller that does not
 * say which direction it means gets the buy rules applied to a sale. That is the
 * 18 September P0 — `mandateGate` evaluated a queued `sell` as a purchase, so
 * above the Phase-1 cap the kill-switch halt would have blocked the exit the
 * drawdown diagnostic recommended.
 */
export type MandateSide = "buy" | "sell";

/**
 * A sale is gated on holding the thing, and on nothing else.
 *
 * Deliberately does not load the mandate book: position caps, theme caps and the
 * kill-switch are all limits on new risk, and a reduction lowers every one of
 * them. Reading the drawdown state here would let the risk control block the
 * de-risk. Quantity is checked where quantity is known — the fill path, not the
 * plan, since a plan is denominated in dollars against a price that will move.
 *
 * Not overridable: an override reason cannot conjure a position that is not held.
 */
async function sellGate(
  instrumentId: string,
  client?: DbClient,
): Promise<
  | { ok: true; violations: MandateViolation[] }
  | { ok: false; error: string; violations: MandateViolation[] }
> {
  const supabase = await resolveDb(client);
  const { data, error } = await supabase
    .from("positions")
    .select("id")
    .eq("instrument_id", instrumentId)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: `Failed to load the position: ${error.message}`,
      violations: [],
    };
  }
  if (!data) {
    return {
      ok: false,
      error: "No open position in this instrument, so there is nothing to sell.",
      violations: [],
    };
  }
  return { ok: true, violations: [] };
}

export async function mandateGate(args: {
  instrumentId: string;
  costUsd: number;
  overrideReason: string | null;
  side: MandateSide;
  supabase?: DbClient;
}): Promise<
  | { ok: true; violations: MandateViolation[] }
  | { ok: false; error: string; violations: MandateViolation[] }
> {
  if (args.side === "sell") {
    return sellGate(args.instrumentId, args.supabase);
  }

  const instrument = await lookupInstrumentTheme(args.instrumentId, args.supabase);
  if (!instrument) {
    return {
      ok: false,
      error: "Unknown instrument.",
      violations: [],
    };
  }

  // Refused before any cap is evaluated, and deliberately not overridable.
  const currencyBlock = bookCurrencyBlock(instrument.symbol, instrument.currency);
  if (currencyBlock != null) {
    return { ok: false, error: currencyBlock, violations: [] };
  }

  const book = await loadMandateBook(args.supabase);
  const violations = evaluateProposedBuy(book, {
    symbol: instrument.symbol,
    themeSlug: instrument.themeSlug,
    costUsd: args.costUsd,
  });

  if (violations.length === 0) {
    return { ok: true, violations };
  }

  const reason = args.overrideReason?.trim() ?? "";
  if (reason.length < 8) {
    return {
      ok: false,
      error: formatMandateBlock(violations),
      violations,
    };
  }

  return { ok: true, violations };
}
