import { getLedgerSummary, type LedgerSummary } from "@/lib/data/ledger";
import { getOpenPortfolioBook, type PortfolioBook } from "@/lib/data/portfolio";
import { freshnessPayload } from "@/lib/data/price-freshness";
import type { DbClient } from "@/lib/supabase/db";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round1(value: number | null): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(value * 10) / 10;
}

export function toPrivatePortfolio(book: PortfolioBook, ledger: LedgerSummary) {
  return {
    nav_usd: round2(book.nav),
    invested_cost_usd: round2(book.invested),
    market_value_usd: round2(book.marketValue),
    unrealized_pnl_usd: round2(book.unrealizedPnl),
    realized_pnl_usd: round2(ledger.realizedPnl),
    deposited_capital_usd: round2(ledger.depositedCapital),
    cash: {
      usd: round2(book.cash),
      pct_nav: round1(book.cashPctNav) ?? 0,
      updated_at: book.cashUpdatedAt,
      notes: book.cashNotes,
    },
    holdings: book.positions.map((row) => ({
      symbol: row.symbol,
      name: row.name,
      theme: { slug: row.themeSlug, name: row.themeName },
      side: row.side,
      quantity: row.quantity,
      avg_cost: round2(row.avgCost),
      cost_basis_usd: round2(row.costBasis),
      last_close: row.lastClose,
      last_close_session: row.lastCloseSession,
      market_value_usd: row.marketValue == null ? round2(row.costBasis) : round2(row.marketValue),
      unrealized_pnl_usd: row.unrealizedPnl == null ? null : round2(row.unrealizedPnl),
      unrealized_pnl_pct: round1(row.unrealizedPnlPct),
      weight_pct_nav: round1(row.weightPctNav),
      opened_at: row.openedAt,
      thesis_summary: row.thesisSummary,
      invalidation: row.invalidation,
    })),
    theme_exposure: book.themeExposures.map((theme) => ({
      slug: theme.slug,
      name: theme.name,
      market_value_usd: round2(theme.marketValue),
      weight_pct_nav: round1(theme.weightPctNav) ?? 0,
      over_cap: theme.overCap,
    })),
    flags: book.flags,
    mark: { label: book.markLabel, as_of: book.markAsOf },
    ...freshnessPayload(book.priceDataThrough),
  };
}

export async function getPrivatePortfolio(supabase: DbClient) {
  const [book, ledger] = await Promise.all([
    getOpenPortfolioBook(supabase),
    getLedgerSummary(25, supabase),
  ]);
  return {
    as_of: new Date().toISOString(),
    ...toPrivatePortfolio(book, ledger),
    recent_ledger: ledger.entries.map((row) => ({
      id: row.id,
      occurred_at: row.occurredAt,
      kind: row.kind,
      symbol: row.symbol,
      quantity: row.quantity,
      price: row.price,
      cash_delta: row.cashDelta,
      realized_pnl: row.realizedPnl,
      notes: row.notes,
    })),
    notes: [
      "TWR, unitized drawdowns, and dollar contribution are on getPerformance. Do not read a performance block here.",
      "last_close_session is the market_bars date for last_close. price_data_through is the latest of those sessions. If price_data_stale is true, do not treat last_close as today's mark.",
      "cash.pct_nav, weight_pct_nav, and unrealized_pnl_pct are percent (1.2 means 1.2%).",
    ],
  };
}
