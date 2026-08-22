import { describe, expect, it } from "vitest";

import { buildNavChartSeries } from "./nav-series";
import type { SnapshotRow } from "./snapshots";

function snap(
  day: string,
  nav: number,
  extras: Partial<SnapshotRow> = {},
): SnapshotRow {
  return {
    asOf: `${day}T22:30:00.000Z`,
    nav,
    cash: nav,
    invested: 0,
    positionsValue: 0,
    ...extras,
  };
}

describe("buildNavChartSeries", () => {
  it("does not treat a same-day deposit as P&L", () => {
    const points = buildNavChartSeries(
      [snap("2026-08-12", 250_000), snap("2026-08-13", 260_000)],
      new Map([["2026-08-13", { external: 10_000, sleeve: 0 }]]),
    );

    expect(points).toHaveLength(2);
    expect(points[0]?.dailyPnl).toBeNull();
    expect(points[0]?.cumulativePnl).toBe(0);
    expect(points[1]?.dailyPnl).toBe(0);
    expect(points[1]?.dailyReturn).toBe(0);
    expect(points[1]?.cumulativePnl).toBe(0);
  });

  it("accumulates economic P&L across sessions", () => {
    const points = buildNavChartSeries([
      snap("2026-08-19", 247_997.83),
      snap("2026-08-20", 247_817.21),
      snap("2026-08-21", 247_561.22),
    ]);

    expect(points[1]?.dailyPnl).toBeCloseTo(-180.62, 2);
    expect(points[2]?.dailyPnl).toBeCloseTo(-255.99, 2);
    expect(points[2]?.cumulativePnl).toBeCloseTo(-436.61, 2);
    expect(points[2]?.dailyReturn).toBeCloseTo(
      247_561.22 / 247_817.21 - 1,
      10,
    );
  });
});
