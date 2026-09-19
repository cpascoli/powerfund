import { describe, expect, it } from "vitest";

import {
  computeDrawdown,
  mergeBookAndSnapshotFlags,
  snapshotFlags,
  type DrawdownSummary,
  type SnapshotRow,
} from "./snapshots";

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
    expect(row?.due).toBe(true);
  });

  it("keeps the 15% condition as a warn after the diagnostic is written", () => {
    const flags = snapshotFlags(
      [{ asOf: "2026-08-22T00:00:00.000Z", nav: 250_000, cash: 232_000, invested: 18_000, positionsValue: 18_000 }],
      summary(),
      {
        status: "monitoring",
        currentPct: 16.2,
        covering: {
          id: "diag-1",
          at: "2026-08-30T11:15:16.000Z",
          text: "completed",
          deployedDrawdownPct: 16.2,
        },
      },
    );
    const row = flags.find((flag) => flag.code === "drawdown_kill_switch");
    expect(row?.severity).toBe("warn");
    expect(row?.due).toBe(false);
    expect(row?.label).toContain("diagnostic completed");
    expect(row?.label).not.toContain("mandatory diagnostic");
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

describe("computeDrawdown", () => {
  it("does not treat a same-session fill at cost as a deployed drawdown", () => {
    const history: SnapshotRow[] = [
      {
        asOf: "2026-08-12T22:30:00.000Z",
        nav: 250_000,
        cash: 250_000,
        invested: 0,
        positionsValue: 0,
      },
    ];
    const flows = new Map([
      ["2026-08-13", { external: 0, sleeve: 10_000 }],
    ]);
    const summary = computeDrawdown(
      history,
      {
        nav: 250_000,
        invested: 10_000,
        positionsValue: 10_000,
        asOf: "2026-08-13T22:30:00.000Z",
      },
      flows,
    );
    expect(summary.deployedDrawdownPp).toBe(0);
    expect(summary.killSwitchBreached).toBe(false);
  });

  /**
   * The raw NAV peak counts a withdrawal as a loss and a deposit as a new high.
   * `getPerformance` has always unitized this; `computeDrawdown` had not, so the
   * same number computed two ways would disagree on two screens the first time
   * capital moved. No deposit or withdrawal has happened since the seed, so the
   * bug could not show itself on live data.
   */
  it("does not count a withdrawal as a NAV drawdown", () => {
    const history: SnapshotRow[] = [
      {
        asOf: "2026-08-12T22:30:00.000Z",
        nav: 250_000,
        cash: 250_000,
        invested: 0,
        positionsValue: 0,
      },
    ];
    // Nothing was bought and nothing moved in price; $50k simply left the book.
    const flows = new Map([["2026-08-13", { external: -50_000, sleeve: 0 }]]);
    const summary = computeDrawdown(
      history,
      {
        nav: 200_000,
        invested: 0,
        positionsValue: 0,
        asOf: "2026-08-13T22:30:00.000Z",
      },
      flows,
    );

    expect(summary.navDrawdownPct).toBeCloseTo(0, 6);
    // The raw-peak reading, which is what this replaced.
    expect(((250_000 - 200_000) / 250_000) * 100).toBeCloseTo(20, 6);
    // Still reported in dollars, which a unitized peak cannot be.
    expect(summary.peakNav).toBe(250_000);
  });

  it("still reports a real NAV drawdown when the book actually falls", () => {
    const history: SnapshotRow[] = [
      {
        asOf: "2026-08-12T22:30:00.000Z",
        nav: 250_000,
        cash: 150_000,
        invested: 100_000,
        positionsValue: 100_000,
      },
    ];
    const summary = computeDrawdown(history, {
      nav: 225_000,
      invested: 100_000,
      positionsValue: 75_000,
      asOf: "2026-08-13T22:30:00.000Z",
    });
    expect(summary.navDrawdownPct).toBeCloseTo(10, 6);
  });

  it("breaches the 15% diagnostic without blocking Phase-1 buys", () => {
    const history: SnapshotRow[] = [
      {
        asOf: "2026-08-12T22:30:00.000Z",
        nav: 250_000,
        cash: 240_000,
        invested: 10_000,
        positionsValue: 10_000,
      },
    ];
    const summary = computeDrawdown(history, {
      nav: 248_500,
      invested: 10_000,
      positionsValue: 8_500,
      asOf: "2026-08-13T22:30:00.000Z",
    });
    expect(summary.deployedDrawdownPp).toBeCloseTo(15, 5);
    expect(summary.killSwitchBreached).toBe(true);
    expect(summary.killSwitchBlocksNewRisk).toBe(false);
  });

  it("puts the kill-switch row on the agent book ahead of all_clear", () => {
    const liveAsOf = new Date().toISOString();
    const prior = new Date(Date.now() - 86_400_000).toISOString();
    const history: SnapshotRow[] = [
      {
        asOf: prior,
        nav: 250_000,
        cash: 240_000,
        invested: 10_000,
        positionsValue: 10_000,
      },
    ];
    const flags = mergeBookAndSnapshotFlags(
      [{ code: "all_clear", severity: "ok", label: "Mandate checks clear vs NAV" }],
      history,
      {
        nav: 248_500,
        invested: 10_000,
        positionsValue: 8_500,
        asOf: liveAsOf,
      },
    );
    expect(flags.map((flag) => flag.code)).toContain("drawdown_kill_switch");
    expect(flags.some((flag) => flag.code === "all_clear")).toBe(true);
    expect(flags.find((flag) => flag.code === "drawdown_kill_switch")?.severity).toBe(
      "warn",
    );
  });
});
