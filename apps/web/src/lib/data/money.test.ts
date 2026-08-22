import { describe, expect, it } from "vitest";
import {
  buyCashDelta,
  previewRealizedPnl,
  sellCashDelta,
  toCents,
} from "@powerfund/domain";

describe("ledger money helpers", () => {
  it("capitalises buy fees into cash leaving the book", () => {
    expect(buyCashDelta(10, 100, 5)).toBe(-1005);
  });

  it("nets sell fees from proceeds", () => {
    expect(sellCashDelta(10, 110, 5)).toBe(1095);
  });

  it("previews realized P&L against average cost", () => {
    expect(
      previewRealizedPnl({ quantity: 10, price: 110, avgCost: 100, fees: 5 }),
    ).toBe(95);
  });

  it("rounds 1.005 to the nearest cent without a toFixed chain", () => {
    expect(toCents(1.005)).toBe(1.01);
  });
});
