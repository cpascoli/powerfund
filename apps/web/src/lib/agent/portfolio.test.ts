import { describe, expect, it } from "vitest";

import type { LedgerSummary } from "@/lib/data/ledger";
import type { PortfolioBook } from "@/lib/data/portfolio";

import { toPrivatePortfolio } from "./portfolio";

const ledger: LedgerSummary = {
  entries: [],
  realizedPnl: 0,
  depositedCapital: 250_000,
  entryCount: 0,
};

const book: PortfolioBook = {
  positions: [
    {
      id: "p1",
      instrumentId: "i1",
      symbol: "VRT",
      name: "Vertiv",
      themeName: "AI Infrastructure",
      themeSlug: "ai-infrastructure",
      side: "long",
      quantity: 10,
      avgCost: 100,
      costBasis: 1000,
      lastClose: 90,
      lastCloseSession: "2026-08-19",
      marketValue: 900,
      unrealizedPnl: -100,
      unrealizedPnlPct: -10,
      weightPctNav: 0.4,
      priceSource: "close",
      openedAt: "2026-08-12T00:00:00.000Z",
      thesisSummary: null,
      invalidation: null,
    },
  ],
  invested: 1000,
  marketValue: 900,
  unrealizedPnl: -100,
  openCount: 1,
  cash: 249_000,
  nav: 249_900,
  cashPctNav: 99.6,
  themeExposures: [],
  flags: [],
  cashUpdatedAt: null,
  cashNotes: null,
  markLabel: "Close",
  markAsOf: null,
  priceDataThrough: "2026-08-19",
};

describe("toPrivatePortfolio", () => {
  it("does not embed a TWR performance block and dates each last_close", () => {
    const payload = toPrivatePortfolio(book, ledger);
    expect(payload).not.toHaveProperty("performance");
    expect(payload.holdings[0]?.last_close).toBe(90);
    expect(payload.holdings[0]?.last_close_session).toBe("2026-08-19");
    expect(payload.price_data_through).toBe("2026-08-19");
    expect(payload.cash.pct_nav).toBe(99.6);
  });
});
