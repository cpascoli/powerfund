import { describe, expect, it } from "vitest";
import {
  accumulateLedgerFlows,
  deployedPeriodReturn,
  drawdownFromPeakPct,
  excessReturn,
  fractionToPercent,
  indexReturn,
  maxDrawdownPct,
  navPeriodReturn,
  roundPercent,
  slicePointsInRange,
  slicePointsOnOrAfter,
  unitizedDeployedIndex,
  unitizedNavIndex,
  windowReturn,
  type PerformancePoint,
} from "@powerfund/domain";

import { parsePerformanceRange } from "@/lib/agent/performance";
import { AgentApiError } from "@/lib/api/agent/errors";

function point(
  date: string,
  nav: number,
  extras: Partial<PerformancePoint> = {},
): PerformancePoint {
  return {
    date,
    nav,
    invested: extras.invested ?? 0,
    positionsValue: extras.positionsValue ?? 0,
    externalFlow: extras.externalFlow ?? 0,
    sleeveFlow: extras.sleeveFlow ?? 0,
  };
}

describe("maxDrawdownPct", () => {
  it("is the worst peak-to-trough, not only the current hole", () => {
    expect(maxDrawdownPct([1, 1.2, 0.9, 1.1])).toBeCloseTo(25, 5);
    expect(maxDrawdownPct([1, 1.2, 0.9, 1.2])).toBeCloseTo(25, 5);
  });

  it("matches current drawdown when the last point is the trough", () => {
    expect(maxDrawdownPct([1, 1.2, 0.9])).toBeCloseTo(25, 5);
  });
});

describe("unitizedNavIndex", () => {
  it("does not treat a deposit as a gain or a recovery", () => {
    const series = unitizedNavIndex([
      point("2026-08-12", 100),
      point("2026-08-13", 200, { externalFlow: 100 }),
      point("2026-08-14", 180),
    ]);
    expect(series[0]).toBe(1);
    expect(series[1]).toBeCloseTo(1, 8);
    expect(series[2]).toBeCloseTo(0.9, 8);
    const scored = windowReturn([
      point("2026-08-12", 100),
      point("2026-08-13", 200, { externalFlow: 100 }),
      point("2026-08-14", 180),
    ]);
    expect(scored?.navMaxDrawdownPct).toBeCloseTo(10, 5);
    expect(scored?.navReturn).toBeCloseTo(-0.1, 8);
  });
});

describe("fractionToPercent", () => {
  it("rounds half away from zero so a negative 10.15% is -10.2", () => {
    expect(fractionToPercent(-0.1015)).toBe(-10.2);
    expect(fractionToPercent(0.1015)).toBe(10.2);
    expect(Math.round(-0.1015 * 1000) / 10).toBe(-10.1);
  });

  it("roundPercent does the same for already-percent drawdowns", () => {
    expect(roundPercent(-11.65)).toBe(-11.7);
    expect(roundPercent(11.65)).toBe(11.7);
  });
});

describe("deployed sleeve TWR", () => {
  it("does not treat a fill at the close as a stock-picking gain or a drawdown", () => {
    const series = [
      point("2026-08-12", 250_000),
      point("2026-08-13", 250_000, {
        invested: 10_000,
        positionsValue: 10_000,
        sleeveFlow: 10_000,
      }),
      point("2026-08-14", 249_000, {
        invested: 10_000,
        positionsValue: 9_000,
      }),
    ];
    expect(deployedPeriodReturn(series)).toBeCloseTo(-0.1, 8);
    expect(unitizedDeployedIndex(series)[1]).toBeCloseTo(1, 8);
    expect(drawdownFromPeakPct(unitizedDeployedIndex(series))).toBeCloseTo(10, 5);
  });

  it("treats buy fees in cash_delta as deployed-sleeve friction that day", () => {
    const series = [
      point("2026-08-12", 250_000),
      point("2026-08-13", 249_995, {
        invested: 10_005,
        positionsValue: 10_000,
        sleeveFlow: 10_005,
      }),
    ];
    expect(deployedPeriodReturn(series)).toBeCloseTo(10_000 / 10_005 - 1, 8);
  });
});

describe("navPeriodReturn vs dividends", () => {
  it("counts a dividend as a NAV gain and not as an external flow", () => {
    const series = [
      point("2026-08-12", 250_000, { positionsValue: 10_000 }),
      point("2026-08-13", 250_005, { positionsValue: 10_000 }),
    ];
    expect(navPeriodReturn(series)).toBeCloseTo(5 / 250_000, 8);
    expect(accumulateLedgerFlows([
      { occurredAt: "2026-08-13T12:00:00.000Z", kind: "dividend", cashDelta: 5 },
    ]).get("2026-08-13")).toEqual({ external: 0, sleeve: 0 });
  });

  it("strips deposits from NAV TWR and counts buys as sleeve flow", () => {
    const flows = accumulateLedgerFlows([
      { occurredAt: "2026-08-13T12:00:00.000Z", kind: "deposit", cashDelta: 50_000 },
      { occurredAt: "2026-08-13T14:00:00.000Z", kind: "buy", cashDelta: -10_000 },
    ]);
    expect(flows.get("2026-08-13")).toEqual({ external: 50_000, sleeve: 10_000 });
  });
});

describe("index and excess return", () => {
  it("is end/start - 1 and arithmetic excess", () => {
    expect(indexReturn(100, 110)).toBeCloseTo(0.1, 8);
    expect(indexReturn(0, 110)).toBeNull();
    expect(excessReturn(0.1, 0.04)).toBeCloseTo(0.06, 8);
    expect(excessReturn(0.1, null)).toBeNull();
  });
});

describe("window slicing", () => {
  const series = [
    point("2026-08-12", 100),
    point("2026-08-14", 110),
    point("2026-08-15", 105),
  ];

  it("starts a since-review window on the last mark on or before the review date", () => {
    const sliced = slicePointsOnOrAfter(series, "2026-08-13");
    expect(sliced[0]?.date).toBe("2026-08-12");
    expect(sliced).toHaveLength(3);
  });

  it("caps a custom range on both ends", () => {
    const sliced = slicePointsInRange(series, "2026-08-14", "2026-08-14");
    expect(sliced.map((row) => row.date)).toEqual(["2026-08-14"]);
  });
});

describe("current vs max drawdown", () => {
  it("reports a recovered hole as max but not current", () => {
    const scored = windowReturn([
      point("2026-08-12", 100, { positionsValue: 100 }),
      point("2026-08-13", 80, { positionsValue: 80 }),
      point("2026-08-14", 90, { positionsValue: 90 }),
    ]);
    expect(scored?.navDrawdownPct).toBeCloseTo(10, 5);
    expect(scored?.navMaxDrawdownPct).toBeCloseTo(20, 5);
    expect(scored?.deployedDrawdownPct).toBeCloseTo(10, 5);
    expect(scored?.deployedMaxDrawdownPct).toBeCloseTo(20, 5);
  });
});

describe("parsePerformanceRange", () => {
  it("accepts YYYY-MM-DD from/to", () => {
    expect(
      parsePerformanceRange(
        new URL("https://example.test/p?from=2026-08-12&to=2026-08-22"),
      ),
    ).toEqual({ from: "2026-08-12", to: "2026-08-22" });
  });

  it("rejects from after to", () => {
    try {
      parsePerformanceRange(
        new URL("https://example.test/p?from=2026-08-22&to=2026-08-12"),
      );
      throw new Error("expected validation");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentApiError);
      expect((error as AgentApiError).status).toBe(422);
    }
  });
});
