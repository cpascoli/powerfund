import {
  evaluateProposedBuy,
  formatMandateBlock,
  type MandateBook,
  type MandateViolation,
} from "@powerfund/domain";

import { getOpenPortfolioBook } from "@/lib/data/portfolio";
import { listInstrumentsWithThemes } from "@/lib/data/research";
import {
  computeDrawdown,
  listPortfolioSnapshots,
} from "@/lib/data/snapshots";

export async function loadMandateBook(): Promise<MandateBook> {
  const [book, snapshots] = await Promise.all([
    getOpenPortfolioBook(),
    listPortfolioSnapshots(),
  ]);
  const drawdown = computeDrawdown(snapshots, {
    nav: book.nav,
    invested: book.invested,
    positionsValue: book.marketValue,
  });
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
): Promise<{ symbol: string; themeSlug: string } | null> {
  const instruments = await listInstrumentsWithThemes();
  const instrument = instruments.find((row) => row.id === instrumentId);
  if (!instrument) return null;
  return { symbol: instrument.symbol, themeSlug: instrument.theme_slug };
}

export async function mandateGate(args: {
  instrumentId: string;
  costUsd: number;
  overrideReason: string | null;
}): Promise<
  | { ok: true; violations: MandateViolation[] }
  | { ok: false; error: string; violations: MandateViolation[] }
> {
  const instrument = await lookupInstrumentTheme(args.instrumentId);
  if (!instrument) {
    return {
      ok: false,
      error: "Unknown instrument.",
      violations: [],
    };
  }

  const book = await loadMandateBook();
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
