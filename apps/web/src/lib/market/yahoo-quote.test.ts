import { describe, expect, it } from "vitest";

import { liveQuoteFromYahoo } from "@powerfund/data-clients";

describe("liveQuoteFromYahoo", () => {
  it("uses pre-market last sale vs previous close before the open", () => {
    const quote = liveQuoteFromYahoo({
      symbol: "NVDA",
      marketState: "PRE",
      regularMarketPrice: 100,
      regularMarketPreviousClose: 100,
      preMarketPrice: 103,
      preMarketTime: "2026-08-27T12:10:00.000Z",
    });

    expect(quote?.price).toBe(103);
    expect(quote?.change).toBe(3);
    expect(quote?.changePct).toBe(3);
    expect(quote?.marketState).toBe("PRE");
  });

  it("uses after-hours last sale vs previous close after the bell", () => {
    const quote = liveQuoteFromYahoo({
      symbol: "NVDA",
      marketState: "POST",
      regularMarketPrice: 101,
      regularMarketPreviousClose: 100,
      postMarketPrice: 99,
      postMarketTime: "2026-08-27T21:10:00.000Z",
    });

    expect(quote?.price).toBe(99);
    expect(quote?.change).toBe(-1);
    expect(quote?.changePct).toBe(-1);
  });
});
