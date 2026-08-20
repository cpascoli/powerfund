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
  listLedgerFlows,
  listPortfolioSnapshots,
} from "@/lib/data/snapshots";
import type { DbClient } from "@/lib/supabase/db";

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
): Promise<{ symbol: string; themeSlug: string } | null> {
  const instruments = await listInstrumentsWithThemes(client);
  const instrument = instruments.find((row) => row.id === instrumentId);
  if (!instrument) return null;
  return { symbol: instrument.symbol, themeSlug: instrument.theme_slug };
}

export async function mandateGate(args: {
  instrumentId: string;
  costUsd: number;
  overrideReason: string | null;
  supabase?: DbClient;
}): Promise<
  | { ok: true; violations: MandateViolation[] }
  | { ok: false; error: string; violations: MandateViolation[] }
> {
  const instrument = await lookupInstrumentTheme(args.instrumentId, args.supabase);
  if (!instrument) {
    return {
      ok: false,
      error: "Unknown instrument.",
      violations: [],
    };
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
