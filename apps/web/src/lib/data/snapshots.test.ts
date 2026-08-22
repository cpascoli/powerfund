import { describe, expect, it } from "vitest";

import { snapshotFlags, type DrawdownSummary } from "./snapshots";

function summary(overrides: Partial<DrawdownSummary> = {}): DrawdownSummary {
  return {
    snapshots: 5,
    peakNav: 250_000,
    navDrawdownPct: 1,
    deployedDrawdownPp: 16.2,
    killSwitchBreached: true,
    killSwitchBlocksNewRisk: false,
    investedCostUsd: 18_000,
    ...overrides,
  };
}

describe("snapshotFlags kill-switch copy", () => {
  it("calls Phase 1 a diagnostic that does not halt new buys", () => {
    const flags = snapshotFlags(
      [{ asOf: "2026-08-22T00:00:00.000Z", nav: 250_000, cash: 232_000, invested: 18_000, positionsValue: 18_000 }],
      summary(),
    );
    const row = flags.find((flag) => flag.code === "drawdown_kill_switch");
    expect(row?.severity).toBe("warn");
    expect(row?.label).toContain("mandatory diagnostic");
    expect(row?.label).toContain("does not halt new buys");
  });

  it("halts new risk in the flag once Phase 1 is behind", () => {
    const flags = snapshotFlags(
      [{ asOf: "2026-08-22T00:00:00.000Z", nav: 250_000, cash: 170_000, invested: 80_000, positionsValue: 80_000 }],
      summary({
        killSwitchBlocksNewRisk: true,
        investedCostUsd: 80_000,
      }),
    );
    const row = flags.find((flag) => flag.code === "drawdown_kill_switch");
    expect(row?.label).toContain("halt new risk");
  });
});
