import { describe, expect, it } from "vitest";
import { assessBarsFreshness } from "@powerfund/domain";

// 20:00 UTC is 16:00 ET, so this instant is after the 16 September close.
const AFTER_16_SEP_CLOSE = "2026-09-16T23:00:00.000Z";

describe("assessBarsFreshness", () => {
  it("is current when the benchmark and every holding reach the session", () => {
    const verdict = assessBarsFreshness({
      benchmarkThrough: "2026-09-16",
      holdings: [
        { symbol: "VRT", through: "2026-09-16" },
        { symbol: "VST", through: "2026-09-16" },
      ],
      asOf: AFTER_16_SEP_CLOSE,
    });

    expect(verdict.expectedSession).toBe("2026-09-16");
    expect(verdict.holdingsThrough).toBe("2026-09-16");
    expect(verdict.behind).toEqual([]);
    expect(verdict.stale).toBe(false);
  });

  it("is stale when the vendor window stopped at the previous session", () => {
    const verdict = assessBarsFreshness({
      benchmarkThrough: "2026-09-15",
      holdings: [
        { symbol: "VRT", through: "2026-09-15" },
        { symbol: "VST", through: "2026-09-15" },
      ],
      asOf: AFTER_16_SEP_CLOSE,
    });

    expect(verdict.stale).toBe(true);
    expect(verdict.behind.map((row) => row.symbol)).toEqual(["VRT", "VST"]);
  });

  // The 17 September failure: SPY and most names had the session, one did not,
  // so `price_data_through` read current while that position carried an old mark.
  it("is stale when a single holding lags a current benchmark", () => {
    const verdict = assessBarsFreshness({
      benchmarkThrough: "2026-09-16",
      holdings: [
        { symbol: "VRT", through: "2026-09-16" },
        { symbol: "NVT", through: "2026-09-15" },
      ],
      asOf: AFTER_16_SEP_CLOSE,
    });

    expect(verdict.holdingsThrough).toBe("2026-09-16");
    expect(verdict.behind).toEqual([{ symbol: "NVT", through: "2026-09-15" }]);
    expect(verdict.stale).toBe(true);
  });

  it("treats a holding with no bars at all as behind", () => {
    const verdict = assessBarsFreshness({
      benchmarkThrough: "2026-09-16",
      holdings: [{ symbol: "IREN", through: null }],
      asOf: AFTER_16_SEP_CLOSE,
    });

    expect(verdict.behind).toEqual([{ symbol: "IREN", through: null }]);
    expect(verdict.stale).toBe(true);
  });

  it("is stale when the benchmark calendar is missing the session", () => {
    // Without SPY's bar the snapshot cannot key a row, whatever the holdings hold.
    const verdict = assessBarsFreshness({
      benchmarkThrough: "2026-09-15",
      holdings: [{ symbol: "VRT", through: "2026-09-16" }],
      asOf: AFTER_16_SEP_CLOSE,
    });

    expect(verdict.behind).toEqual([]);
    expect(verdict.stale).toBe(true);
  });

  it("does not call the day stale before that session has closed", () => {
    // 10:07 Bangkok on 17 September is 23:07 ET on the 16th: the 16 September
    // session is the one that must be present, not the 17th.
    const verdict = assessBarsFreshness({
      benchmarkThrough: "2026-09-16",
      holdings: [{ symbol: "VRT", through: "2026-09-16" }],
      asOf: "2026-09-17T03:07:00.000Z",
    });

    expect(verdict.expectedSession).toBe("2026-09-16");
    expect(verdict.stale).toBe(false);
  });

  it("holds the weekend at Friday's session", () => {
    const verdict = assessBarsFreshness({
      benchmarkThrough: "2026-09-18",
      holdings: [{ symbol: "VRT", through: "2026-09-18" }],
      asOf: "2026-09-19T03:07:00.000Z",
    });

    expect(verdict.expectedSession).toBe("2026-09-18");
    expect(verdict.stale).toBe(false);
  });

  it("is current with no open positions when the calendar is current", () => {
    const verdict = assessBarsFreshness({
      benchmarkThrough: "2026-09-16",
      holdings: [],
      asOf: AFTER_16_SEP_CLOSE,
    });

    expect(verdict.holdingsThrough).toBeNull();
    expect(verdict.stale).toBe(false);
  });
});
