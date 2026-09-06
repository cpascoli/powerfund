import { describe, expect, it } from "vitest";
import {
  describePriceRebase,
  detectPriceRebase,
  findSeriesDiscontinuities,
  type StoredClose,
} from "@powerfund/domain";

/**
 * The real case: Amphenol split two-for-one on 26 August 2026. Our series held
 * pre-split prices for the sessions the refresh window had already passed over,
 * so what we stored was exactly twice what the vendor now returns.
 */
const APH_STORED: StoredClose[] = [
  { date: "2026-08-26", close: 80.67 },
  { date: "2026-08-27", close: 80.69 },
  { date: "2026-08-28", close: 78.87 },
  { date: "2026-08-31", close: 79.28 },
  { date: "2026-09-01", close: 163.18 },
  { date: "2026-09-02", close: 160.08 },
];

const APH_FETCHED: StoredClose[] = [
  { date: "2026-08-26", close: 80.67 },
  { date: "2026-08-27", close: 80.69 },
  { date: "2026-08-28", close: 78.87 },
  { date: "2026-08-31", close: 79.28 },
  { date: "2026-09-01", close: 81.59 },
  { date: "2026-09-02", close: 80.04 },
];

describe("detectPriceRebase", () => {
  it("says nothing when the vendor still agrees", () => {
    const result = detectPriceRebase(APH_FETCHED, APH_FETCHED);
    expect(result.rebased).toBe(false);
    expect(result.comparedSessions).toBe(6);
    expect(result.disagreeingSessions).toBe(0);
    expect(describePriceRebase(result)).toBe("series agrees with the vendor");
  });

  it("catches the Amphenol split from the sessions that disagree", () => {
    const result = detectPriceRebase(APH_STORED, APH_FETCHED);
    expect(result.rebased).toBe(true);
    expect(result.disagreeingSessions).toBe(2);
    expect(result.ratio).toBeCloseTo(2, 3);
    expect(result.consistent).toBe(true);
    expect(result.looksLikeSplit).toBe(true);
    expect(result.firstDisagreement).toBe("2026-09-01");
    expect(describePriceRebase(result)).toContain("looks like a split");
  });

  it("tolerates the last-decimal revisions vendors make", () => {
    const nudged = APH_FETCHED.map((row) => ({
      ...row,
      close: row.close * 1.001,
    }));
    expect(detectPriceRebase(nudged, APH_FETCHED).rebased).toBe(false);
  });

  it("flags a one-off correction without calling it a split", () => {
    const stored = APH_FETCHED.map((row, i) =>
      i === 2 ? { ...row, close: row.close * 1.4 } : row,
    );
    const result = detectPriceRebase(stored, APH_FETCHED);
    expect(result.rebased).toBe(true);
    expect(result.disagreeingSessions).toBe(1);
    expect(result.consistent).toBe(false);
    expect(result.looksLikeSplit).toBe(false);
    expect(describePriceRebase(result)).toContain("not a split signature");
  });

  it("will not call a single 2x session a split", () => {
    // 4 September 2026, exactly: our series was correct and Yahoo served one
    // unadjusted print for 31 August. `rebased` was true and `ratio` was a
    // clean 0.5, so the old gate refetched 1,900 days and overwrote five years
    // of good prices with the vendor's bad ones. A split moves every session.
    const stored = APH_FETCHED.map((row, i) =>
      i === 1 ? { ...row, close: row.close / 2 } : row,
    );
    const result = detectPriceRebase(stored, APH_FETCHED);
    expect(result.rebased).toBe(true);
    expect(result.disagreeingSessions).toBe(1);
    expect(result.ratio).toBeCloseTo(0.5, 4);
    // A single session is trivially "consistent" with itself. That is the trap.
    expect(result.consistent).toBe(false);
    expect(result.looksLikeSplit).toBe(false);
  });

  it("handles a reverse split", () => {
    const stored = APH_FETCHED.map((row) => ({ ...row, close: row.close / 10 }));
    const result = detectPriceRebase(stored, APH_FETCHED);
    expect(result.ratio).toBeCloseTo(0.1, 4);
    expect(result.consistent).toBe(true);
    expect(result.looksLikeSplit).toBe(true);
  });

  it("ignores sessions it cannot compare", () => {
    const result = detectPriceRebase(
      [{ date: "2026-01-02", close: 10 }],
      APH_FETCHED,
    );
    expect(result.comparedSessions).toBe(0);
    expect(result.rebased).toBe(false);
  });
});

describe("findSeriesDiscontinuities", () => {
  it("finds the split boundary inside our own stored series", () => {
    const jumps = findSeriesDiscontinuities([
      { date: "2026-08-25", close: 158.78 },
      { date: "2026-08-26", close: 80.67 },
      { date: "2026-08-31", close: 79.28 },
      { date: "2026-09-01", close: 163.18 },
    ]);
    expect(jumps.map((row) => row.date)).toEqual(["2026-08-26", "2026-09-01"]);
    expect(jumps[0]?.changePct).toBeCloseTo(-49.2, 1);
    expect(jumps[1]?.changePct).toBeCloseTo(105.8, 1);
  });

  it("leaves an ordinary volatile series alone", () => {
    const jumps = findSeriesDiscontinuities([
      { date: "2026-08-25", close: 100 },
      { date: "2026-08-26", close: 120 },
      { date: "2026-08-27", close: 95 },
    ]);
    expect(jumps).toEqual([]);
  });
});
