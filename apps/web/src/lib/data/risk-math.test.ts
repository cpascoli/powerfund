import { describe, expect, it } from "vitest";
import {
  FACTOR_EXPOSURES,
  FACTOR_KEYS,
  crowdingBand,
  computeCrowding,
  pairwiseCorrelations,
  percentileOfLast,
} from "@powerfund/domain";

describe("factor map", () => {
  it("keeps every mapped name unit-sum", () => {
    for (const [symbol, record] of Object.entries(FACTOR_EXPOSURES)) {
      const sum = FACTOR_KEYS.reduce(
        (total, key) => total + (record.weights[key] ?? 0),
        0,
      );
      expect(sum, symbol).toBeCloseTo(1, 6);
    }
  });
});

describe("crowding", () => {
  it("treats a new high far above the 200-day SMA as crowded", () => {
    const closes = Array.from({ length: 200 }, (_, i) => 100 + i * 0.1);
    closes.push(200);
    const snapshot = computeCrowding(closes);
    expect(snapshot?.band).toBe("crowded");
    expect(snapshot?.pricePercentile).toBe(100);
    expect(snapshot?.extensionPct).toBeGreaterThan(15);
  });

  it("is calm near the median and the SMA", () => {
    const closes = [...Array.from({ length: 199 }, (_, i) => i + 1), 100];
    expect(computeCrowding(closes)?.band).toBe("calm");
    expect(percentileOfLast([1, 2, 3, 4], 2)).toBe(50);
    expect(crowdingBand(85, 5)).toBe("extended");
  });
});

describe("pairwiseCorrelations", () => {
  it("is 1 for identical overlapping log-return series and null below 20 days", () => {
    const points = Array.from({ length: 22 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      close: 100 * 1.01 ** i,
    }));
    const pairs = pairwiseCorrelations([
      { symbol: "VRT", points },
      { symbol: "NVT", points },
    ]);
    expect(pairs[0]?.observations).toBe(21);
    expect(pairs[0]?.correlation).toBeCloseTo(1, 8);

    const short = pairwiseCorrelations([
      { symbol: "A", points: points.slice(0, 10) },
      { symbol: "B", points: points.slice(0, 10) },
    ]);
    expect(short[0]?.correlation).toBeNull();
  });
});
