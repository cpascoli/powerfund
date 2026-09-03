import { describe, expect, it } from "vitest";
import {
  ESTIMATED_FILING_LAG_DAYS,
  addDays,
  estimatedKnowableAt,
  latestVintages,
  latestVintagesAsOf,
  resolveKnowableAt,
} from "@powerfund/domain";

type Row = {
  periodEnd: string;
  knowableAt: string;
  observedAt: string;
  revenue: number;
};

function row(
  periodEnd: string,
  knowableAt: string,
  revenue: number,
  observedAt = "2026-09-03T00:00:00Z",
): Row {
  return { periodEnd, knowableAt, observedAt, revenue };
}

describe("resolveKnowableAt", () => {
  it("uses the real filing date when the vendor gives one", () => {
    expect(resolveKnowableAt("2025-09-30", "2025-10-22")).toEqual({
      knowableAt: "2025-10-22",
      basis: "filing",
    });
  });

  it("falls back to a conservative estimate when there is none", () => {
    // Yahoo publishes period ends, never filing dates.
    expect(resolveKnowableAt("2026-06-30", null)).toEqual({
      knowableAt: addDays("2026-06-30", ESTIMATED_FILING_LAG_DAYS),
      basis: "estimated",
    });
  });

  it("rejects a filing date that precedes the period it reports", () => {
    const resolved = resolveKnowableAt("2026-06-30", "2026-01-05");
    expect(resolved.basis).toBe("estimated");
  });

  it("estimates late rather than early", () => {
    // Being late understates a strategy. Being early is look-ahead bias, which
    // is the defect this table exists to remove.
    expect(estimatedKnowableAt("2026-06-30") > "2026-06-30").toBe(true);
  });
});

describe("latestVintagesAsOf", () => {
  const original = row("2026-03-31", "2026-05-01", 100);
  const restated = row("2026-03-31", "2026-08-14", 92);

  it("hides a restatement that had not been filed yet", () => {
    const asOf = latestVintagesAsOf([original, restated], "2026-06-30");
    expect(asOf).toHaveLength(1);
    expect(asOf[0]?.revenue).toBe(100);
  });

  it("uses the restatement once it is knowable", () => {
    const asOf = latestVintagesAsOf([original, restated], "2026-09-01");
    expect(asOf[0]?.revenue).toBe(92);
  });

  it("returns nothing before the first filing", () => {
    expect(latestVintagesAsOf([original, restated], "2026-04-01")).toEqual([]);
  });

  it("breaks a same-day tie on when we observed it", () => {
    const early = row("2026-03-31", "2026-05-01", 100, "2026-05-01T09:00:00Z");
    const late = row("2026-03-31", "2026-05-01", 101, "2026-05-01T18:00:00Z");
    expect(latestVintagesAsOf([early, late], "2026-06-30")[0]?.revenue).toBe(101);
  });

  it("keeps one row per period, oldest period first", () => {
    const rows = [
      row("2026-06-30", "2026-08-01", 3),
      row("2025-12-31", "2026-02-01", 1),
      row("2026-03-31", "2026-05-01", 2),
    ];
    expect(latestVintagesAsOf(rows, "2026-09-01").map((r) => r.periodEnd)).toEqual([
      "2025-12-31",
      "2026-03-31",
      "2026-06-30",
    ]);
  });

  it("does not let an as-of cut resurrect a superseded number", () => {
    // Three observations of one quarter; as-of sits between the second and third.
    const rows = [
      row("2026-03-31", "2026-05-01", 100),
      row("2026-03-31", "2026-06-10", 95),
      row("2026-03-31", "2026-08-14", 92),
    ];
    expect(latestVintagesAsOf(rows, "2026-07-01")[0]?.revenue).toBe(95);
  });
});

describe("latestVintages", () => {
  it("is current best knowledge with no as-of cut", () => {
    const rows = [
      row("2026-03-31", "2026-05-01", 100),
      row("2026-03-31", "2026-08-14", 92),
    ];
    expect(latestVintages(rows)[0]?.revenue).toBe(92);
  });
});
