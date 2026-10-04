import { describe, expect, it } from "vitest";
import {
  buildMemoryStrip,
  groupMemoryByDay,
  isMemoryKind,
  memoryCounts,
  stripIntensity,
  type MemoryEvent,
  type MemoryKind,
} from "@powerfund/domain";

function event(
  at: string,
  kind: MemoryKind,
  extra: Partial<MemoryEvent> = {},
): MemoryEvent {
  return {
    id: `${kind}:${at}:${Math.random()}`,
    kind,
    at,
    symbol: null,
    title: kind,
    summary: null,
    badge: null,
    future: false,
    ...extra,
  };
}

describe("groupMemoryByDay", () => {
  it("reads backwards, newest day and newest item first", () => {
    const groups = groupMemoryByDay([
      event("2026-08-12T10:00:00Z", "decision"),
      event("2026-08-14T09:00:00Z", "company"),
      event("2026-08-14T18:00:00Z", "portfolio"),
    ]);
    expect(groups.map((g) => g.date)).toEqual(["2026-08-14", "2026-08-12"]);
    expect(groups[0]?.events.map((e) => e.kind)).toEqual([
      "portfolio",
      "company",
    ]);
  });

  it("counts each kind within the day", () => {
    const groups = groupMemoryByDay([
      event("2026-08-14T09:00:00Z", "company"),
      event("2026-08-14T10:00:00Z", "company"),
      event("2026-08-14T11:00:00Z", "decision"),
    ]);
    expect(groups[0]?.counts).toEqual({
      company: 2,
      decision: 1,
      portfolio: 0,
      calendar: 0,
    });
  });
});

describe("buildMemoryStrip", () => {
  it("keeps one column per day while the history is short", () => {
    const strip = buildMemoryStrip([
      event("2026-08-01T10:00:00Z", "decision"),
      event("2026-08-05T10:00:00Z", "decision"),
    ]);
    expect(strip.bucketDays).toBe(1);
    expect(strip.buckets).toHaveLength(5);
  });

  /**
   * The strip is an overview, so it has to stay a fixed readable width as
   * history accumulates. A year of daily columns is a smear.
   */
  it("widens the bucket rather than the strip once the span is long", () => {
    const strip = buildMemoryStrip(
      [
        event("2026-01-01T10:00:00Z", "decision"),
        event("2026-12-31T10:00:00Z", "decision"),
      ],
      { maxBuckets: 60 },
    );
    expect(strip.bucketDays).toBeGreaterThan(1);
    expect(strip.buckets.length).toBeLessThanOrEqual(60);
  });

  it("keeps empty buckets, because the gaps are the finding", () => {
    // A week with no portfolio memory is exactly what the historical review
    // gate is trying to make visible, so it must render as a gap not vanish.
    const strip = buildMemoryStrip([
      event("2026-08-01T10:00:00Z", "portfolio"),
      event("2026-08-10T10:00:00Z", "portfolio"),
    ]);
    expect(strip.buckets).toHaveLength(10);
    expect(strip.buckets.filter((b) => b.total === 0)).toHaveLength(8);
  });

  it("counts each kind into its own lane", () => {
    const strip = buildMemoryStrip([
      event("2026-08-01T10:00:00Z", "company"),
      event("2026-08-01T11:00:00Z", "company"),
      event("2026-08-01T12:00:00Z", "calendar"),
    ]);
    expect(strip.buckets[0]?.counts).toEqual({
      company: 2,
      decision: 0,
      portfolio: 0,
      calendar: 1,
    });
    expect(strip.peak).toBe(3);
  });

  it("has no buckets at all when there is nothing to show", () => {
    expect(buildMemoryStrip([]).buckets).toEqual([]);
  });

  /**
   * The stream only has a section for days with memories. A cell has to link
   * to one of those, per lane, or a click lands nowhere — on a quiet first day
   * of a multi-day bucket, or on the day another lane's memory sits.
   */
  it("anchors each lane's cell on the first day that lane has a memory", () => {
    const strip = buildMemoryStrip(
      [
        event("2026-01-01T10:00:00Z", "decision"),
        event("2026-01-03T10:00:00Z", "company"),
        event("2026-01-02T09:00:00Z", "company"),
        event("2026-12-31T10:00:00Z", "decision"),
      ],
      { maxBuckets: 60 },
    );
    expect(strip.bucketDays).toBeGreaterThan(2);
    const first = strip.buckets[0]!;
    expect(first.firstDay).toEqual({ decision: "2026-01-01", company: "2026-01-02" });
    // Quiet buckets offer nothing to link to.
    expect(strip.buckets[1]!.firstDay).toEqual({});
  });
});

describe("stripIntensity", () => {
  /**
   * One day seeded 46 dossier versions while an ordinary working day carries
   * two or three. Linear scaling renders every real day as indistinguishable
   * from empty, which inverts what the strip is for: the rhythm matters more
   * than the outlier.
   */
  it("keeps an ordinary day visible next to a 46-item outlier", () => {
    const ordinary = stripIntensity(3, 46);
    expect(ordinary).toBeGreaterThan(0.2);
    expect(3 / 46).toBeLessThan(0.07);
  });

  it("gives the peak full intensity and nothing none", () => {
    expect(stripIntensity(46, 46)).toBe(1);
    expect(stripIntensity(0, 46)).toBe(0);
    expect(stripIntensity(5, 0)).toBe(0);
  });
});

describe("isMemoryKind", () => {
  it("accepts the four memories and rejects anything else", () => {
    expect(isMemoryKind("company")).toBe(true);
    expect(isMemoryKind("calendar")).toBe(true);
    expect(isMemoryKind("positions")).toBe(false);
  });
});

describe("memoryCounts", () => {
  const events = [
    event("2026-09-01T10:00:00Z", "decision", { symbol: "VRT" }),
    event("2026-09-02T10:00:00Z", "company", { symbol: "VRT" }),
    event("2026-09-02T11:00:00Z", "company", { symbol: "SNDK" }),
    event("2026-09-03T10:00:00Z", "portfolio"),
  ];

  it("counts everything when no name is chosen", () => {
    expect(memoryCounts(events)).toEqual({
      total: 4,
      inScope: 4,
      byKind: { company: 2, decision: 1, portfolio: 1, calendar: 0 },
    });
  });

  it("scopes the header and the lane counts to the chosen name, keeping the total", () => {
    expect(memoryCounts(events, "VRT")).toEqual({
      total: 4,
      inScope: 2,
      byKind: { company: 1, decision: 1, portfolio: 0, calendar: 0 },
    });
  });
});
