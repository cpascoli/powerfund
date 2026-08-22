import { describe, expect, it } from "vitest";
import {
  maxDrawdownPct,
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
