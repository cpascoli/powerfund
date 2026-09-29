import { describe, expect, it } from "vitest";

import type { LiveQuote } from "@powerfund/data-clients";

import { companyQuoteMark } from "./company-quote";

function quote(overrides: Partial<LiveQuote>): LiveQuote {
  return {
    symbol: "KTOS",
    price: 47,
    asOf: "2026-09-25T20:00:00.000Z",
    marketState: "CLOSED",
    change: null,
    changePct: null,
    previousClose: 48,
    regularPrice: 47,
    source: "yahoo",
    ...overrides,
  };
}

const bars = [
  { date: "2026-09-24", close: 48 },
  { date: "2026-09-25", close: 47 },
];

describe("companyQuoteMark", () => {
  it("colors a daily close against the prior available close", () => {
    const mark = companyQuoteMark({
      quote: quote({}),
      bars,
      lastClose: 47,
    });

    expect(mark?.price).toBe(47);
    expect(mark?.direction).toBe("down");
    expect(mark?.label).toBe("Daily close");
    expect(mark?.asOfLabel).toBe("Fri, Sep 25, 2026, 4:00 PM EDT");
  });

  it("uses the stored prior bar when the vendor is absent", () => {
    const mark = companyQuoteMark({
      quote: null,
      bars,
      lastClose: 47,
    });

    expect(mark?.direction).toBe("down");
    expect(mark?.label).toBe("Daily close");
    expect(mark?.asOfLabel).toBe("Fri, Sep 25, 2026, 4:00 PM ET");
  });

  it("leaves a single close uncolored", () => {
    const mark = companyQuoteMark({
      quote: null,
      bars: [{ date: "2026-09-25", close: 47 }],
      lastClose: 47,
    });

    expect(mark?.direction).toBe("flat");
    expect(mark?.asOfLabel).toBe("Fri, Sep 25, 2026, 4:00 PM ET");
  });

  it("colors a live price against the prior session close", () => {
    const mark = companyQuoteMark({
      quote: quote({
        price: 49,
        marketState: "REGULAR",
        asOf: "2026-09-25T15:30:00.000Z",
        previousClose: 48,
        regularPrice: 49,
      }),
      bars: [{ date: "2026-09-24", close: 48 }],
      lastClose: 48,
    });

    expect(mark?.direction).toBe("up");
    expect(mark?.label).toBe("Live price");
    expect(mark?.asOfLabel).toBe("Fri, Sep 25, 2026, 11:30 AM EDT");
  });

  it("colors a before-market price against the prior close", () => {
    const mark = companyQuoteMark({
      quote: quote({
        price: 46,
        marketState: "PRE",
        asOf: "2026-09-25T12:10:00.000Z",
        previousClose: 47,
        regularPrice: 47,
      }),
      bars,
      lastClose: 47,
    });

    expect(mark?.direction).toBe("down");
    expect(mark?.label).toBe("Before market");
  });

  it("colors an after-market price against today's cash close", () => {
    const mark = companyQuoteMark({
      quote: quote({
        price: 100.5,
        marketState: "POST",
        asOf: "2026-09-25T21:10:00.000Z",
        previousClose: 100,
        regularPrice: 101,
      }),
      bars: [{ date: "2026-09-24", close: 100 }],
      lastClose: 100,
    });

    expect(mark?.direction).toBe("down");
    expect(mark?.label).toBe("After market");
    expect(mark?.asOfLabel).toBe("Fri, Sep 25, 2026, 5:10 PM EDT");
  });

  it("uses the stored session close when the vendor omits the regular price", () => {
    const mark = companyQuoteMark({
      quote: quote({
        price: 100.5,
        marketState: "POSTPOST",
        asOf: "2026-09-25T22:00:00.000Z",
        previousClose: 100,
        regularPrice: null,
      }),
      bars: [{ date: "2026-09-25", close: 101 }],
      lastClose: 101,
    });

    expect(mark?.direction).toBe("down");
    expect(mark?.label).toBe("After market");
  });
});
