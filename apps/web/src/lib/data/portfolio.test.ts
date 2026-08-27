import { describe, expect, it } from "vitest";

import type { LiveQuote } from "@powerfund/data-clients";

import { applyLiveMarks, weekCloseFromBars, type PortfolioBook } from "./portfolio";

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
        weekClose: 90,
        marketValue: 1000,
        unrealizedPnl: 200,
        unrealizedPnlPct: 25,
        dayPnl: 50,
        dayPnlPct: 5.263157894736842,
        weekPnl: 100,
        weekPnlPct: 11.11111111111111,
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
    expect(row.weekClose).toBe(90);
    expect(row.weekPnl).toBe(200);
    expect(row.weekPnlPct).toBeCloseTo((20 / 90) * 100, 8);
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

describe("weekCloseFromBars", () => {
  it("picks the last close on or before 7 calendar days earlier", () => {
    expect(
      weekCloseFromBars([
        { date: "2026-08-26", close: 100 },
        { date: "2026-08-25", close: 98 },
        { date: "2026-08-21", close: 94 },
        { date: "2026-08-19", close: 90 },
        { date: "2026-08-18", close: 88 },
      ]),
    ).toBe(90);
  });

  it("returns null when history does not reach a week back", () => {
    expect(
      weekCloseFromBars([
        { date: "2026-08-26", close: 100 },
        { date: "2026-08-25", close: 98 },
      ]),
    ).toBeNull();
  });
});
