import { describe, expect, it } from "vitest";

import { heatForMapColor } from "@/components/position-treemap";

const row = {
  dayPnl: 10,
  dayPnlPct: 2,
  weekPnl: 40,
  weekPnlPct: 8,
  unrealizedPnl: 200,
  unrealizedPnlPct: 25,
};

describe("heatForMapColor", () => {
  it("selects the matching dollar and percent fields", () => {
    expect(heatForMapColor(row, "day")).toEqual({ usd: 10, pct: 2 });
    expect(heatForMapColor(row, "week")).toEqual({ usd: 40, pct: 8 });
    expect(heatForMapColor(row, "pnl")).toEqual({ usd: 200, pct: 25 });
  });
});
