import { describe, expect, it } from "vitest";

import type { PublicPortfolio } from "./book";

const publicKeys = [
  "cash_pct_nav",
  "deployed_pct_nav",
  "ai_capex_pct_nav",
  "ai_memory_pct_nav",
  "positions",
  "themes",
  "flags",
] as const;

const publicPositionKeys = [
  "symbol",
  "name",
  "theme",
  "side",
  "weight_pct_nav",
  "return_pct",
  "opened_at",
  "thesis_summary",
] as const;

describe("public portfolio projection", () => {
  it("does not include private dollar or quantity fields", () => {
    const sample: PublicPortfolio = {
      cash_pct_nav: 40,
      deployed_pct_nav: 60,
      ai_capex_pct_nav: 20,
      ai_memory_pct_nav: 5,
      positions: [
        {
          symbol: "MRCY",
          name: "Mercury",
          theme: { slug: "defence", name: "Defence" },
          side: "long",
          weight_pct_nav: 6.2,
          return_pct: 12,
          opened_at: "2026-08-01T00:00:00.000Z",
          thesis_summary: "Verified",
        },
      ],
      themes: [{ slug: "defence", name: "Defence", weight_pct_nav: 6.2 }],
      flags: [{ code: "all_clear", severity: "ok", label: "ok" }],
    };

    expect(Object.keys(sample).sort()).toEqual([...publicKeys].sort());
    expect(Object.keys(sample.positions[0]!).sort()).toEqual(
      [...publicPositionKeys].sort(),
    );
    expect(JSON.stringify(sample)).not.toContain("avg_cost");
    expect(JSON.stringify(sample)).not.toContain("quantity");
    expect(JSON.stringify(sample)).not.toContain("cash_usd");
    expect(JSON.stringify(sample)).not.toContain("planned_usd");
  });
});
