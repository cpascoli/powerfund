import { describe, expect, it } from "vitest";
import {
  accumulateLedgerFlows,
  buildPerformancePoints,
  drawdownFromPeakPct,
  fillSessionDate,
  lastCompletedCashSession,
  maxDrawdownPct,
  reconstructSnapshots,
  snapshotAlignmentIssues,
  unitizedDeployedIndex,
  type LedgerEntry,
  type PerformanceMark,
} from "@powerfund/domain";

/**
 * These are the tests that were missing when the NAV series went wrong.
 *
 * The existing performance tests hand-build fixtures where the flow and the mark
 * already agree on a day, so they check the maths and never the inputs. What
 * broke in production was the input: snapshots stamped with wall-clock run time
 * rather than the session they marked, and flows bucketed on the UTC calendar day
 * rather than the session a fill first marks on.
 */

const SESSIONS = ["2026-08-26", "2026-08-27", "2026-08-28", "2026-08-31"];

/** Real closes for the open book over the window the fill day was fabricated in. */
const CLOSES: Record<string, Record<string, number>> = {
  "2026-08-26": {
    VRT: 263.81, CLS: 307.32, NVT: 155.23, MRCY: 89.76, NBIS: 213.93, VST: 140.03,
  },
  "2026-08-27": {
    VRT: 269.28, CLS: 317.38, NVT: 155.55, MRCY: 90.47, NBIS: 218.48, VST: 139.81,
  },
  "2026-08-28": {
    VRT: 257.08, CLS: 298.7, NVT: 148.48, MRCY: 88.54, NBIS: 209.18, VST: 137.09,
  },
  "2026-08-31": {
    VRT: 258.72, CLS: 299.4, NVT: 150.75, MRCY: 87.33, NBIS: 206.32, VST: 137.37,
  },
};

function closes(sessions = SESSIONS) {
  return new Map(
    sessions.map((session) => [
      session,
      new Map(Object.entries(CLOSES[session] ?? {})),
    ]),
  );
}

/** The real ledger: five starters opened before this window, VST filled mid-session on 28 Aug. */
const LEDGER: LedgerEntry[] = [
  { occurredAt: "2026-08-12T15:00:00+00:00", kind: "deposit", instrumentId: null, quantity: null, cashDelta: 250000, basisDelta: null },
  { occurredAt: "2026-08-12T15:28:00+00:00", kind: "buy", instrumentId: "VRT", quantity: 16.86133, cashDelta: -5000.06, basisDelta: 5000.06 },
  { occurredAt: "2026-08-13T15:23:00+00:00", kind: "buy", instrumentId: "CLS", quantity: 14.35535, cashDelta: -4999.97, basisDelta: 4999.97 },
  { occurredAt: "2026-08-13T20:20:00+00:00", kind: "buy", instrumentId: "NVT", quantity: 26.32387, cashDelta: -4500, basisDelta: 4500 },
  { occurredAt: "2026-08-13T20:28:00+00:00", kind: "buy", instrumentId: "MRCY", quantity: 22.89121, cashDelta: -2500, basisDelta: 2500 },
  { occurredAt: "2026-08-13T20:31:00+00:00", kind: "buy", instrumentId: "NBIS", quantity: 5.91113, cashDelta: -1500, basisDelta: 1500 },
  { occurredAt: "2026-08-28T15:29:00+00:00", kind: "buy", instrumentId: "VST", quantity: 21.4203, cashDelta: -3000, basisDelta: 3000 },
];

describe("fillSessionDate", () => {
  it("keeps an in-session fill on that session", () => {
    // 15:29 UTC on 28 Aug is 11:29 ET — the fill marks that evening.
    expect(fillSessionDate("2026-08-28T15:29:00+00:00")).toBe("2026-08-28");
  });

  it("keeps an evening booking on the session it was typed in after", () => {
    // 23:23 UTC on 31 Aug is 19:23 ET — still the 31 Aug trading day for the
    // operator, even though UTC has not rolled over yet either way.
    expect(fillSessionDate("2026-08-31T23:23:00+00:00")).toBe("2026-08-31");
  });

  it("does not let a late-evening booking slide into the next UTC day", () => {
    // 01:30 UTC on 1 Sep is 21:30 ET on 31 Aug. The UTC day says 1 September;
    // the book says the operator was still trading 31 August.
    expect(fillSessionDate("2026-09-01T01:30:00+00:00")).toBe("2026-08-31");
  });

  it("walks a weekend booking back to the prior session", () => {
    expect(fillSessionDate("2026-08-29T14:00:00+00:00")).toBe("2026-08-28");
    expect(fillSessionDate("2026-08-30T14:00:00+00:00")).toBe("2026-08-28");
  });

  it("never runs ahead of the last completed session by more than one", () => {
    for (const iso of [
      "2026-08-28T15:29:00+00:00",
      "2026-08-31T23:23:00+00:00",
      "2026-08-29T14:00:00+00:00",
      "2026-09-01T09:00:00+00:00",
    ]) {
      expect(fillSessionDate(iso) >= lastCompletedCashSession(iso)).toBe(true);
    }
  });
});

describe("accumulateLedgerFlows", () => {
  it("buckets a fill on the session it marks on, not its UTC day", () => {
    const flows = accumulateLedgerFlows([
      // 21:30 ET on 31 Aug — already 1 September in UTC.
      { occurredAt: "2026-09-01T01:30:00+00:00", kind: "buy", cashDelta: -3000 },
    ]);
    expect(flows.get("2026-09-01")).toBeUndefined();
    expect(flows.get("2026-08-31")?.sleeve).toBe(3000);
  });

  it("separates external flows from sleeve flows", () => {
    const flows = accumulateLedgerFlows([
      { occurredAt: "2026-08-12T15:00:00+00:00", kind: "deposit", cashDelta: 250000 },
      { occurredAt: "2026-08-12T15:28:00+00:00", kind: "buy", cashDelta: -5000.06 },
    ]);
    expect(flows.get("2026-08-12")).toEqual({ external: 250000, sleeve: 5000.06 });
  });
});

describe("buildPerformancePoints", () => {
  const marks: PerformanceMark[] = [
    { date: "2026-08-26", nav: 100, invested: 100, positionsValue: 100 },
    { date: "2026-08-28", nav: 100, invested: 100, positionsValue: 100 },
  ];

  it("folds a flow from a session with no mark into the next mark", () => {
    // 27 Aug has no snapshot — a holiday, or a nightly run that failed.
    const flows = new Map([["2026-08-27", { external: 0, sleeve: 500 }]]);
    const points = buildPerformancePoints(marks, flows);
    expect(points[1]?.sleeveFlow).toBe(500);
  });

  it("carries a flow booked after the last mark onto a live final mark", () => {
    // The live book already holds the position, so it must hold the flow too.
    const flows = new Map([["2026-09-04", { external: 0, sleeve: 750 }]]);
    const points = buildPerformancePoints(marks, flows, {
      openEndedFinalMark: true,
    });
    expect(points[1]?.sleeveFlow).toBe(750);
  });

  it("keeps that flow off a historical final mark", () => {
    // A stored snapshot from 28 August cannot contain a fill booked later.
    // Attaching the flow anyway is precisely how the phantom loss was made.
    const flows = new Map([["2026-09-04", { external: 0, sleeve: 750 }]]);
    const points = buildPerformancePoints(marks, flows);
    expect(points[1]?.sleeveFlow).toBe(0);
  });

  it("does not let a later flow leak onto an earlier mark", () => {
    const flows = new Map([["2026-08-28", { external: 0, sleeve: 400 }]]);
    const points = buildPerformancePoints(marks, flows);
    expect(points[0]?.sleeveFlow).toBe(0);
    expect(points[1]?.sleeveFlow).toBe(400);
  });
});

describe("reconstructSnapshots", () => {
  it("marks a position only from its own session's bar", () => {
    const rebuilt = reconstructSnapshots({
      entries: LEDGER,
      sessions: SESSIONS,
      closes: closes(),
    });
    for (const snapshot of rebuilt) {
      for (const position of snapshot.positions) {
        expect(position.closeDate).toBe(snapshot.session);
      }
    }
  });

  it("includes a mid-session fill in that session's mark", () => {
    const rebuilt = reconstructSnapshots({
      entries: LEDGER,
      sessions: SESSIONS,
      closes: closes(),
    });
    const aug27 = rebuilt.find((row) => row.session === "2026-08-27");
    const aug28 = rebuilt.find((row) => row.session === "2026-08-28");
    expect(aug27?.positions.some((row) => row.instrumentId === "VST")).toBe(false);
    expect(aug28?.positions.some((row) => row.instrumentId === "VST")).toBe(true);
    expect(aug28?.invested).toBeCloseTo(21500.03, 2);
  });

  it("declares a missing bar as stale and carries the prior close", () => {
    const partial = closes();
    partial.get("2026-08-28")?.delete("MRCY");
    const rebuilt = reconstructSnapshots({
      entries: LEDGER,
      sessions: SESSIONS,
      closes: partial,
      priorClose: (instrumentId, session) =>
        instrumentId === "MRCY" && session === "2026-08-28"
          ? { close: 90.47, date: "2026-08-27" }
          : null,
    });
    const aug28 = rebuilt.find((row) => row.session === "2026-08-28");
    expect(aug28?.staleMarks).toContain("MRCY");
    const mrcy = aug28?.positions.find((row) => row.instrumentId === "MRCY");
    expect(mrcy?.closeDate).toBe("2026-08-27");
  });

  it("cannot produce two sessions with identical marks", () => {
    const rebuilt = reconstructSnapshots({
      entries: LEDGER,
      sessions: SESSIONS,
      closes: closes(),
    });
    expect(snapshotAlignmentIssues(rebuilt)).toEqual([]);
  });
});

describe("snapshotAlignmentIssues", () => {
  it("catches a mark taken from another session", () => {
    const issues = snapshotAlignmentIssues([
      {
        session: "2026-08-27",
        cash: 0,
        invested: 100,
        positionsValue: 120,
        nav: 120,
        staleMarks: [],
        positions: [
          {
            instrumentId: "VRT",
            quantity: 1,
            invested: 100,
            close: 263.81,
            closeDate: "2026-08-26",
            value: 120,
          },
        ],
      },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("mark_from_other_session");
  });

  it("catches the duplicate-row signature", () => {
    const row = {
      cash: 0,
      invested: 100,
      positionsValue: 16265.41,
      nav: 16265.41,
      staleMarks: [],
      positions: [
        {
          instrumentId: "VRT",
          quantity: 1,
          invested: 100,
          close: 1,
          closeDate: "",
          value: 16265.41,
        },
      ],
    };
    const issues = snapshotAlignmentIssues([
      { ...row, session: "2026-08-26", positions: [{ ...row.positions[0]!, closeDate: "2026-08-26" }] },
      { ...row, session: "2026-08-27", positions: [{ ...row.positions[0]!, closeDate: "2026-08-27" }] },
    ]);
    expect(issues.map((issue) => issue.code)).toContain("duplicate_marks");
  });
});

describe("regression — the 28 August phantom drawdown", () => {
  /** Sleeve path the broken pipeline stored: 27 Aug duplicated 26 Aug, and the
   * row labelled 28 Aug held 27 Aug closes taken before the VST fill. */
  const brokenMarks: PerformanceMark[] = [
    { date: "2026-08-26", nav: 0, invested: 18500.03, positionsValue: 16265.41 },
    { date: "2026-08-27", nav: 0, invested: 18500.03, positionsValue: 16265.41 },
    { date: "2026-08-28", nav: 0, invested: 18500.03, positionsValue: 16553.63 },
    { date: "2026-08-31", nav: 0, invested: 21500.03, positionsValue: 21813.05 },
  ];

  it("reproduces the fabricated loss when the flow lands on a mark that predates it", () => {
    const brokenFlows = new Map([
      ["2026-08-28", { external: 0, sleeve: 3000 }],
    ]);
    const points = buildPerformancePoints(brokenMarks, brokenFlows);
    const index = unitizedDeployedIndex(points);
    // 16,553.63 / (16,265.41 + 3,000) − 1 — a 14% loss that never happened.
    // Chained into the series from 12 August it is what pushed the published
    // max deployed drawdown to 25.1% against a true 16.4%.
    expect(index[2]! / index[1]! - 1).toBeCloseTo(-0.141, 3);
    expect(maxDrawdownPct(index)!).toBeGreaterThan(14);
  });

  it("rebuilds the same window with no phantom day", () => {
    const rebuilt = reconstructSnapshots({
      entries: LEDGER,
      sessions: SESSIONS,
      closes: closes(),
    });
    expect(snapshotAlignmentIssues(rebuilt)).toEqual([]);

    const flows = accumulateLedgerFlows(
      LEDGER.map((entry) => ({
        occurredAt: entry.occurredAt,
        kind: entry.kind,
        cashDelta: entry.cashDelta,
      })),
    );
    const points = buildPerformancePoints(
      rebuilt.map((row) => ({
        date: row.session,
        nav: row.nav,
        invested: row.invested,
        positionsValue: row.positionsValue,
      })),
      flows,
    );
    const index = unitizedDeployedIndex(points);

    // 28 Aug is a real down day for the five names held into it, not a −14% cliff.
    expect(index[2]! / index[1]! - 1).toBeCloseTo(-0.0421, 3);
    // And the sleeve never falls anywhere near the published 25.1%.
    expect(maxDrawdownPct(index)!).toBeLessThan(6);
    expect(drawdownFromPeakPct(index)!).toBeLessThan(6);
  });
});
