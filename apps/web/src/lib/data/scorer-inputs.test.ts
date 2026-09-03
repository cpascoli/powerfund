import { describe, expect, it } from "vitest";
import {
  forwardReturn,
  sliceScorerInputsAsOf,
  type InstrumentHistory,
  type QuarterVintage,
} from "@powerfund/domain";

function quarter(
  periodEnd: string,
  knowableAt: string,
  revenue: number,
  observedAt = "2026-09-03T00:00:00Z",
): QuarterVintage {
  return {
    periodEnd,
    knowableAt,
    observedAt,
    revenue,
    capex: null,
    freeCashFlow: null,
    netDebt: null,
    sharesDiluted: null,
    ingestedAt: observedAt,
  };
}

const HISTORY: InstrumentHistory = {
  vintages: [
    quarter("2025-12-31", "2026-02-01", 100),
    quarter("2026-03-31", "2026-05-01", 110),
    // The March quarter was restated downward in August.
    quarter("2026-03-31", "2026-08-14", 96),
    quarter("2026-06-30", "2026-08-01", 120),
  ],
  bars: [
    { date: "2026-04-01", close: 10 },
    { date: "2026-05-01", close: 11 },
    { date: "2026-06-01", close: 12 },
    { date: "2026-07-01", close: 9 },
    { date: "2026-08-03", close: 15 },
  ],
  caps: [
    { date: "2026-04-01", marketCap: 1000 },
    { date: "2026-07-01", marketCap: 900 },
  ],
};

describe("sliceScorerInputsAsOf", () => {
  it("hides a quarter that had not been filed yet", () => {
    const inputs = sliceScorerInputsAsOf(HISTORY, "2026-04-15");
    expect(inputs.quarters.map((q) => q.periodEnd)).toEqual(["2025-12-31"]);
  });

  it("uses the original figure before the restatement was filed", () => {
    const inputs = sliceScorerInputsAsOf(HISTORY, "2026-06-15");
    const march = inputs.quarters.find((q) => q.periodEnd === "2026-03-31");
    expect(march?.revenue).toBe(110);
  });

  it("uses the restated figure once it is knowable", () => {
    const inputs = sliceScorerInputsAsOf(HISTORY, "2026-09-01");
    const march = inputs.quarters.find((q) => q.periodEnd === "2026-03-31");
    expect(march?.revenue).toBe(96);
  });

  it("never reaches past the as-of date for prices", () => {
    const inputs = sliceScorerInputsAsOf(HISTORY, "2026-06-15");
    expect(inputs.closes).toEqual([10, 11, 12]);
    expect(inputs.lastBarDate).toBe("2026-06-01");
  });

  it("takes the market cap standing at the date, not the newest", () => {
    expect(sliceScorerInputsAsOf(HISTORY, "2026-06-15").marketCap).toBe(1000);
    expect(sliceScorerInputsAsOf(HISTORY, "2026-09-01").marketCap).toBe(900);
  });

  it("keeps only the most recent window of closes", () => {
    const inputs = sliceScorerInputsAsOf(HISTORY, "2026-09-01", {
      barWindow: 2,
    });
    expect(inputs.closes).toEqual([9, 15]);
  });

  it("reports no bar when the name had not started trading", () => {
    const inputs = sliceScorerInputsAsOf(HISTORY, "2026-01-01");
    expect(inputs.closes).toEqual([]);
    expect(inputs.lastBarDate).toBeNull();
    expect(inputs.marketCap).toBeNull();
  });

  it("dates the inputs by when the vintage was observed", () => {
    const inputs = sliceScorerInputsAsOf(HISTORY, "2026-09-01");
    expect(inputs.quarters[0]?.ingestedAt).toBe("2026-09-03T00:00:00Z");
  });
});

describe("forwardReturn", () => {
  it("measures the move over the next n sessions", () => {
    // 2026-05-01 close 11 -> two sessions later 2026-07-01 close 9.
    expect(forwardReturn(HISTORY.bars, "2026-05-01", 2)).toBeCloseTo(9 / 11 - 1, 10);
  });

  it("anchors on the last bar at or before the date", () => {
    expect(forwardReturn(HISTORY.bars, "2026-05-15", 1)).toBeCloseTo(12 / 11 - 1, 10);
  });

  it("returns null when the window has not elapsed", () => {
    expect(forwardReturn(HISTORY.bars, "2026-08-03", 1)).toBeNull();
  });

  it("returns null before the first bar", () => {
    expect(forwardReturn(HISTORY.bars, "2026-01-01", 1)).toBeNull();
  });
});
