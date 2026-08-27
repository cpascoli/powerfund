import { describe, expect, it } from "vitest";

import type { LiveQuote } from "@powerfund/data-clients";

import { applyLiveMarks, type PortfolioBook } from "./portfolio";

function quote(overrides: Partial<LiveQuote>): LiveQuote {
  return {
    symbol: "VRT",
    price: 110,
    asOf: "2026-08-27T14:15:00.000Z",
    marketState: "REGULAR",
    change: 10,
    changePct: 10,
    previousClose: 100,
    source: "yahoo",
    ...overrides,
  };
}

function closeBook(): PortfolioBook {
  return {
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
        avgCost: 80,
        costBasis: 800,
        lastClose: 100,
        lastCloseSession: "2026-08-26",
        markPrice: 100,
        previousClose: 95,
        marketValue: 1000,
        unrealizedPnl: 200,
        unrealizedPnlPct: 25,
        dayPnl: 50,
        dayPnlPct: 5.263157894736842,
        weightPctNav: 0.4,
        priceSource: "close",
        openedAt: "2026-08-12T00:00:00.000Z",
        thesisSummary: null,
        invalidation: null,
      },
    ],
    invested: 800,
    marketValue: 1000,
    unrealizedPnl: 200,
    dayPnl: 50,
    dayPnlPct: 50 / 250_950,
    openCount: 1,
    cash: 249_000,
    nav: 250_000,
    cashPctNav: 99.6,
    themeExposures: [],
    flags: [],
    cashUpdatedAt: null,
    cashNotes: null,
    markLabel: "Close",
    markAsOf: null,
    tapeActive: false,
    priceDataThrough: "2026-08-26",
  };
}

describe("applyLiveMarks", () => {
  it("marks the book at the live last sale and keeps the stored close", () => {
    const live = applyLiveMarks(closeBook(), [quote({})]);
    const row = live.positions[0]!;

    expect(row.lastClose).toBe(100);
    expect(row.lastCloseSession).toBe("2026-08-26");
    expect(row.markPrice).toBe(110);
    expect(row.previousClose).toBe(100);
    expect(row.marketValue).toBe(1100);
    expect(row.unrealizedPnl).toBe(300);
    expect(row.dayPnl).toBe(100);
    expect(row.dayPnlPct).toBe(10);
    expect(row.priceSource).toBe("live");
    expect(live.nav).toBe(250_100);
    expect(live.dayPnl).toBe(100);
    expect(live.dayPnlPct).toBeCloseTo(0.04, 8);
    expect(live.markLabel).toBe("Delayed");
    expect(live.tapeActive).toBe(true);
  });

  it("uses pre-market last sale when the regular session has not opened", () => {
    const live = applyLiveMarks(closeBook(), [
      quote({
        price: 102,
        marketState: "PRE",
        asOf: "2026-08-27T12:05:00.000Z",
        previousClose: 100,
      }),
    ]);

    expect(live.positions[0]?.markPrice).toBe(102);
    expect(live.markLabel).toBe("Pre-market");
    expect(live.tapeActive).toBe(true);
  });

  it("leaves stored closes in place when no quotes arrive", () => {
    const book = closeBook();
    expect(applyLiveMarks(book, [])).toBe(book);
  });
});
