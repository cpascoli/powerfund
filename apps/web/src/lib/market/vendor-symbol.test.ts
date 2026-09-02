import { describe, expect, it } from "vitest";

import { vendorSymbol } from "@powerfund/domain";

import { canOverlayLiveQuote } from "./quotes";

describe("vendorSymbol", () => {
  it("uses data_symbol when the house ticker is not the listing", () => {
    expect(vendorSymbol("SKHY", "000660.KS")).toBe("000660.KS");
  });

  it("falls back to the house ticker", () => {
    expect(vendorSymbol("TSM", null)).toBe("TSM");
    expect(vendorSymbol("TSM", "  ")).toBe("TSM");
  });

  it("does not overlay a USD last sale onto a local-currency bar series", () => {
    expect(canOverlayLiveQuote({ symbol: "SKHY", dataSymbol: "000660.KS" })).toBe(
      false,
    );
    expect(canOverlayLiveQuote({ symbol: "TSM" })).toBe(true);
  });
});
