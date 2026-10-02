import { hyperscalerCapexStress } from "@powerfund/domain";
import { describe, expect, it } from "vitest";

import type { RiskView } from "@/lib/data/risk";

import { toRiskSnapshot } from "./risk";

const HOLDINGS = [
  { symbol: "VRT", themeSlug: "ai-infrastructure", themeName: "AI infrastructure", marketValue: 10_000 },
  { symbol: "SNDK", themeSlug: "ai-infrastructure", themeName: "AI infrastructure", marketValue: 5_000 },
  { symbol: "LMT", themeSlug: "defence", themeName: "Defence", marketValue: 4_000 },
  { symbol: "ZZZZ", themeSlug: "other", themeName: "Other", marketValue: 1_000 },
];
const NAV = 100_000;

describe("hyperscalerCapexStress", () => {
  const stress = hyperscalerCapexStress(HOLDINGS, NAV);

  it("haircuts each holding by 20% times its mapped AI-capex weight", () => {
    // VRT ai_capex 1 → 2,000; SNDK ai_memory 1 counts fully → 1,000;
    // LMT defence → 0; ZZZZ unmapped → 0 and flagged.
    expect(stress.rows.map((row) => [row.symbol, row.delta])).toEqual([
      ["VRT", 2_000],
      ["SNDK", 1_000],
      ["LMT", 0],
      ["ZZZZ", 0],
    ]);
    expect(stress.navDelta).toBe(3_000);
    expect(stress.navDeltaPct).toBe(3);
    expect(stress.stressedNav).toBe(97_000);
  });

  it("does not count an unclassified name as safe", () => {
    expect(stress.unclassified).toEqual(["ZZZZ"]);
    expect(stress.rows.find((row) => row.symbol === "ZZZZ")!.aiCapexWeight).toBeNull();
    expect(stress.rows.find((row) => row.symbol === "LMT")!.aiCapexWeight).toBe(0);
  });

  it("splits the loss by theme and isolates the memory part", () => {
    expect(stress.byTheme.map((theme) => [theme.themeSlug, theme.delta])).toEqual([
      ["ai-infrastructure", 3_000],
      ["defence", 0],
      ["other", 0],
    ]);
    expect(stress.rows.find((row) => row.symbol === "SNDK")!.memoryDelta).toBe(1_000);
    expect(stress.rows.find((row) => row.symbol === "VRT")!.memoryDelta).toBe(0);
  });
});

function view(): RiskView {
  const stress = hyperscalerCapexStress(HOLDINGS, NAV);
  return {
    asOf: "2026-10-02T12:00:00.000Z",
    priceDataThrough: "2026-10-01",
    nav: NAV,
    deployed: 20_000,
    aiCapexPct: 15,
    aiMemoryPct: 5,
    diversifierPct: 4,
    stressNav: stress.stressedNav,
    stressNavDelta: stress.navDelta,
    stressNavDeltaPct: stress.navDeltaPct,
    holdings: [],
    stress,
    crowding: [],
    symbols: ["CRDO", "LMT", "SNDK", "VRT"],
    heldSymbols: ["VRT", "SNDK", "LMT", "ZZZZ"],
    correlationFrom: "2025-08-28",
    seriesThrough: { VRT: "2026-10-01" },
    pairs: [
      { a: "CRDO", b: "VRT", observations: 270, correlation: 0.81 },
      { a: "LMT", b: "SNDK", observations: 270, correlation: 0.05 },
      { a: "SNDK", b: "VRT", observations: 270, correlation: 0.62 },
      { a: "LMT", b: "VRT", observations: 12, correlation: null },
    ],
  };
}

describe("toRiskSnapshot", () => {
  it("quotes the Workbench stress exactly, as negative impacts", () => {
    const snapshot = toRiskSnapshot(view());
    const stress = snapshot.hyperscaler_capex_stress;
    expect(stress.shock_pct).toBe(20);
    expect(stress.nav_impact_usd).toBe(-3_000);
    expect(stress.nav_impact_pct).toBe(-3);
    expect(stress.stressed_nav_usd).toBe(97_000);
    expect(stress.by_holding.find((row) => row.symbol === "VRT")).toMatchObject({
      impact_usd: -2_000,
      impact_pct_nav: -2,
      ai_capex_weight: 1,
      factor_weights: { ai_capex: 1 },
    });
    expect(stress.by_factor).toEqual([
      { factor: "ai_capex", impact_usd: -2_000 },
      { factor: "ai_memory", impact_usd: -1_000 },
    ]);
    expect(snapshot.concentration.unclassified).toEqual(["ZZZZ"]);
  });

  it("defaults to held pairs, strongest first, and says which holdings have no history", () => {
    const { correlation } = toRiskSnapshot(view());
    expect(correlation.pairs.map((pair) => `${pair.a}-${pair.b}`)).toEqual([
      "SNDK-VRT",
      "LMT-SNDK",
      "LMT-VRT",
    ]);
    // CRDO is an active thesis, not held: only in the "all" universe.
    expect(correlation.pairs.some((pair) => pair.a === "CRDO")).toBe(false);
    expect(correlation.held_without_history).toEqual(["ZZZZ"]);
    expect(correlation.window).toMatchObject({ calendar_days: 400, from: "2025-08-28" });
  });

  it("widens to the full matrix and filters by |correlation| on request", () => {
    const { correlation } = toRiskSnapshot(view(), { universe: "all", min_abs_correlation: 0.6 });
    expect(correlation.pairs.map((pair) => [`${pair.a}-${pair.b}`, pair.both_held])).toEqual([
      ["CRDO-VRT", false],
      ["SNDK-VRT", true],
    ]);
  });

  it("reports freshness from the stored closes, not the clock", () => {
    const snapshot = toRiskSnapshot(view());
    expect(snapshot.price_data_through).toBe("2026-10-01");
    expect(typeof snapshot.price_data_stale).toBe("boolean");
  });
});
