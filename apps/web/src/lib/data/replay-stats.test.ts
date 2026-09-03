import { describe, expect, it } from "vitest";
import {
  aggregateReplay,
  isScoreableSetup,
  type ReplayObservation,
} from "@powerfund/domain";

const HORIZONS = [{ label: "3m", sessions: 63 }];

function obs(
  symbol: string,
  date: string,
  setup: ReplayObservation["setup"],
  ret: number | null,
): ReplayObservation {
  return { symbol, date, setup, forward: new Map([["3m", ret]]) };
}

function stat(result: ReturnType<typeof aggregateReplay>, setup: string) {
  return result.stats.find((row) => row.setup === setup)?.byHorizon[0];
}

describe("isScoreableSetup", () => {
  it("treats insufficient_data as unscoreable", () => {
    expect(isScoreableSetup("insufficient_data")).toBe(false);
    expect(isScoreableSetup("improving_research")).toBe(true);
    expect(isScoreableSetup("watch")).toBe(true);
  });
});

describe("aggregateReplay", () => {
  it("keeps unscoreable names out of the baseline", () => {
    // Two scoreable names at +10% and +20%, and an unscoreable moonshot at
    // +200% that must not drag the comparison it is measured against.
    const rows = [
      obs("AAA", "2026-01-02", "watch", 0.1),
      obs("BBB", "2026-01-02", "watch", 0.2),
      obs("ZZZ", "2026-01-02", "insufficient_data", 2.0),
    ];
    const result = aggregateReplay(rows, HORIZONS);
    expect(result.baselineObservations).toBe(2);
    expect(result.excludedFromBaseline).toBe(1);

    // AAA is compared against BBB alone: 0.10 - 0.20 = -0.10.
    // Were ZZZ in the baseline the comparison would be far harsher.
    const watch = stat(result, "watch");
    expect(watch?.meanExcess).toBeCloseTo(((0.1 - 0.2) + (0.2 - 0.1)) / 2, 10);
  });

  it("compares a scoreable name leave-one-out, not against itself", () => {
    const rows = [
      obs("AAA", "2026-01-02", "watch", 0.1),
      obs("BBB", "2026-01-02", "watch", 0.3),
    ];
    const watch = stat(aggregateReplay(rows, HORIZONS), "watch");
    // Each is measured against the other, so the excesses are ±0.20, not ±0.10.
    expect(watch?.meanExcess).toBeCloseTo(0, 10);
    const rowsAsymmetric = [
      obs("AAA", "2026-01-02", "watch", 0.1),
      obs("BBB", "2026-01-02", "improving_research", 0.3),
    ];
    const research = stat(aggregateReplay(rowsAsymmetric, HORIZONS), "improving_research");
    expect(research?.meanExcess).toBeCloseTo(0.3 - 0.1, 10);
  });

  it("still grades the unscoreable bucket against the scoreable universe", () => {
    const rows = [
      obs("AAA", "2026-01-02", "watch", 0.1),
      obs("BBB", "2026-01-02", "watch", 0.2),
      obs("ZZZ", "2026-01-02", "insufficient_data", 2.0),
    ];
    const insufficient = stat(aggregateReplay(rows, HORIZONS), "insufficient_data");
    // Not leave-one-out — it was never in the baseline: 2.0 - 0.15.
    expect(insufficient?.meanExcess).toBeCloseTo(2.0 - 0.15, 10);
  });

  it("reports no excess when a date has no scoreable peer", () => {
    const rows = [obs("AAA", "2026-01-02", "watch", 0.1)];
    expect(stat(aggregateReplay(rows, HORIZONS), "watch")?.meanExcess).toBeNull();
  });

  it("ignores observations whose horizon has not elapsed", () => {
    const rows = [
      obs("AAA", "2026-01-02", "watch", null),
      obs("BBB", "2026-01-02", "watch", 0.2),
    ];
    const watch = stat(aggregateReplay(rows, HORIZONS), "watch");
    expect(watch?.graded).toBe(1);
    expect(stat(aggregateReplay(rows, HORIZONS), "watch")?.meanReturn).toBeCloseTo(0.2, 10);
  });

  it("computes mean, median and hit rate over graded observations", () => {
    const rows = [
      obs("A", "d1", "watch", -0.1),
      obs("B", "d1", "watch", 0.2),
      obs("C", "d1", "watch", 0.6),
    ];
    const watch = stat(aggregateReplay(rows, HORIZONS), "watch");
    expect(watch?.graded).toBe(3);
    expect(watch?.meanReturn).toBeCloseTo((-0.1 + 0.2 + 0.6) / 3, 10);
    expect(watch?.medianReturn).toBeCloseTo(0.2, 10);
    expect(watch?.hitRate).toBeCloseTo(2 / 3, 10);
  });
});
