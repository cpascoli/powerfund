import { describe, expect, it } from "vitest";

import { appendLiveChartPoint, buildNavChartSeries } from "./nav-series";
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

describe("appendLiveChartPoint", () => {
  it("appends today's live mark after the last EOD snapshot", () => {
    const points = appendLiveChartPoint(
      buildNavChartSeries([
        snap("2026-08-25", 250_000),
        snap("2026-08-26", 249_000),
      ]),
      {
        asOf: "2026-08-27T14:15:00.000Z",
        nav: 249_400,
        cash: 200_000,
        invested: 50_000,
        positionsValue: 49_400,
        dayPnl: 400,
      },
    );

    expect(points).toHaveLength(3);
    expect(points[2]?.date).toBe("2026-08-27");
    expect(points[2]?.nav).toBe(249_400);
    expect(points[2]?.dailyPnl).toBe(400);
    expect(points[2]?.cumulativePnl).toBeCloseTo(-600, 8);
    expect(points[2]?.live).toBe(true);
  });

  it("replaces a same-day snapshot instead of doubling the session", () => {
    const points = appendLiveChartPoint(
      buildNavChartSeries([
        snap("2026-08-26", 249_000),
        snap("2026-08-27", 249_100),
      ]),
      {
        asOf: "2026-08-27T20:10:00.000Z",
        nav: 249_400,
        cash: 200_000,
        invested: 50_000,
        positionsValue: 49_400,
        dayPnl: 400,
      },
    );

    expect(points).toHaveLength(2);
    expect(points[1]?.nav).toBe(249_400);
    expect(points[1]?.dailyPnl).toBe(400);
    expect(points[1]?.live).toBe(true);
  });
});
