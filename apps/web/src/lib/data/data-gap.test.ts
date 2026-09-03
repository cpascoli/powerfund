import { describe, expect, it } from "vitest";
import {
  INFLECTION_THRESHOLDS,
  dataGapLabel,
  scoreInflection,
  type FundamentalQuarter,
} from "@powerfund/domain";

/**
 * `insufficient_data` used to say only that the scorer had nothing to work with.
 * It conflated a name we started following recently, which resolves itself on a
 * predictable schedule, with one nothing we ingest publishes quarterly figures
 * for, which never does.
 */

function quarters(count: number, revenue = 1000): FundamentalQuarter[] {
  return Array.from({ length: count }, (_, i) => ({
    periodEnd: `2026-${String(((i % 4) * 3) + 1).padStart(2, "0")}-28`,
    revenue: revenue + i * 10,
    capex: null,
    freeCashFlow: null,
    netDebt: null,
    sharesDiluted: null,
    ingestedAt: "2026-09-03T00:00:00Z",
  })).map((row, i) => ({
    ...row,
    periodEnd: new Date(Date.UTC(2022, i * 3, 28)).toISOString().slice(0, 10),
  }));
}

function score(args: { quarters: FundamentalQuarter[]; closes: number[] }) {
  return scoreInflection({
    quarters: args.quarters,
    closes: args.closes,
    marketCap: 1_000_000,
    asOf: "2026-09-02",
    calculatedAt: "2026-09-03T00:00:00.000Z",
    priceThrough: "2026-09-02",
    calendarThrough: "2026-09-02",
  });
}

describe("dataGap", () => {
  it("is absent once the scorer can form a view", () => {
    const snapshot = score({
      quarters: quarters(12),
      closes: Array.from({ length: 300 }, (_, i) => 100 + i),
    });
    expect(snapshot.setup).not.toBe("insufficient_data");
    expect(snapshot.dataGap).toBeNull();
  });

  it("says how many prints a young name still needs", () => {
    const snapshot = score({
      quarters: quarters(6),
      closes: Array.from({ length: 300 }, (_, i) => 100 + i),
    });
    expect(snapshot.setup).toBe("insufficient_data");
    expect(snapshot.dataGap?.reasons).toContain("short_fundamentals");
    // Six quarters give two year-on-year comparisons; the flag needs five.
    expect(snapshot.dataGap?.yoyHeld).toBe(2);
    expect(snapshot.dataGap?.yoyNeeded).toBe(INFLECTION_THRESHOLDS.priorYoyCount + 1);
    expect(snapshot.dataGap?.yoyShort).toBe(3);
    expect(snapshot.dataGap?.estimatedMonthsToResolve).toBe(9);
    expect(dataGapLabel(snapshot.dataGap)).toBe(
      "Needs 3 more quarterly prints (about 9 months)",
    );
  });

  it("distinguishes a name nothing publishes quarterly for", () => {
    const snapshot = score({
      quarters: [],
      closes: Array.from({ length: 300 }, (_, i) => 100 + i),
    });
    expect(snapshot.dataGap?.reasons).toContain("no_fundamentals");
    // Nothing is accumulating, so no wait is quoted — waiting is not the answer.
    expect(snapshot.dataGap?.estimatedMonthsToResolve).toBeNull();
    expect(dataGapLabel(snapshot.dataGap)).toBe(
      "No quarterly financials from any source — waiting will not fix this",
    );
  });

  it("does not call a name unscoreable for price history alone", () => {
    // With the fundamentals in hand the scorer still has a view; it just cannot
    // band crowding. That is a partial answer, not an absent one.
    const snapshot = score({
      quarters: quarters(12),
      closes: Array.from({ length: 39 }, (_, i) => 100 + i),
    });
    expect(snapshot.setup).not.toBe("insufficient_data");
    expect(snapshot.missing).toContain("price_history");
    expect(snapshot.crowding.band).toBe("unknown");
    expect(snapshot.dataGap).toBeNull();
  });

  it("counts a short price history when the name is unscoreable anyway", () => {
    const snapshot = score({
      quarters: quarters(5),
      closes: Array.from({ length: 39 }, (_, i) => 100 + i),
    });
    expect(snapshot.dataGap?.reasons).toContain("short_price_history");
    expect(snapshot.dataGap?.closesHeld).toBe(39);
    expect(snapshot.dataGap?.closesNeeded).toBe(
      INFLECTION_THRESHOLDS.minClosesForPrice,
    );
    expect(snapshot.dataGap?.closesShort).toBe(21);
    expect(dataGapLabel(snapshot.dataGap)).toContain(
      "21 more sessions of price history",
    );
  });

  it("reports both shortfalls when a name is new on every axis", () => {
    const snapshot = score({
      quarters: quarters(5),
      closes: Array.from({ length: 39 }, (_, i) => 100 + i),
    });
    expect(snapshot.dataGap?.reasons).toEqual([
      "short_fundamentals",
      "short_price_history",
    ]);
    expect(dataGapLabel(snapshot.dataGap)).toContain("and");
  });

  it("puts the explanation in the rationale the operator reads", () => {
    const snapshot = score({
      quarters: quarters(6),
      closes: Array.from({ length: 300 }, (_, i) => 100 + i),
    });
    expect(snapshot.rationale).toContain("Needs 3 more quarterly prints");
  });
});
