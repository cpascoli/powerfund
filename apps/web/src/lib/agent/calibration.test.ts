import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DbClient } from "@/lib/supabase/db";

/**
 * Reconciling the first live calibration meant reading fifteen ids out of the
 * database by hand. This is that check, and the cases below are the three
 * mistakes it exists to catch: a decision still owed after a run, a grade landing
 * on the wrong decision, and a decision that can never be graded quietly
 * vanishing from the cohort.
 */

const DECISIONS = [
  { id: "d-enter", instrument_id: "i-vrt", symbol: "VRT", decision_type: "enter", action_at: "2026-08-12T14:00:00Z" },
  { id: "d-hold", instrument_id: "i-vrt", symbol: "VRT", decision_type: "hold", action_at: "2026-08-14T14:00:00Z" },
  { id: "d-nofill", instrument_id: "i-sndk", symbol: "SNDK", decision_type: "enter", action_at: "2026-08-30T14:00:00Z" },
  { id: "d-watch", instrument_id: "i-alab", symbol: "ALAB", decision_type: "watch", action_at: "2026-08-30T14:00:00Z" },
];

/** Horizons that have elapsed, per decision. */
const ELAPSED: Record<string, number[]> = {};
/** Graded horizons per decision; null is an off-clock observation. */
const OUTCOMES: Record<string, Array<number | null>> = {};

vi.mock("@/lib/data/decisions", () => ({
  listDecisions: async () => DECISIONS,
}));

vi.mock("@/lib/data/decision-returns", () => ({
  loadDecisionRelativeReturns: async (
    _db: unknown,
    rows: Array<{ id: string; decision_type: string }>,
  ) =>
    new Map(
      rows.map((row) => {
        const fillAnchored = ["enter", "add", "reduce", "exit"].includes(
          row.decision_type,
        );
        // The one case that matters: a fill-anchored decision with no fill has
        // no anchor at all, so it never reaches the worklist.
        const anchored = row.id !== "d-nofill";
        return [
          row.id,
          {
            method: "close_to_close",
            decisionClass:
              row.decision_type === "hold"
                ? "continuation"
                : row.decision_type === "watch"
                  ? "candidate"
                  : "position_originating",
            anchor: anchored
              ? {
                  kind: fillAnchored ? "fill" : "decision",
                  at: "2026-08-12T14:00:00Z",
                  session: "2026-08-12",
                  fillKind: fillAnchored ? "buy" : null,
                }
              : null,
            fill: null,
            reason: anchored ? null : "no_fill",
            horizons: [30, 90, 180].map((days) => ({
              days,
              start: "2026-08-12",
              target: "2026-09-11",
              asOf: "2026-08-12",
              complete: (ELAPSED[row.id] ?? []).includes(days),
              tickerReturn: null,
              spyReturn: null,
              vsSpy: null,
            })),
          },
        ];
      }),
    ),
}));

vi.mock("@/lib/journal/record-outcome", () => ({
  listDecisionOutcomes: async () =>
    new Map(
      Object.entries(OUTCOMES).map(([id, graded]) => [
        id,
        graded.map((horizon_days, i) => ({
          id: `${id}-o${i}`,
          decision_id: id,
          recorded_at: "2026-09-12T00:00:00Z",
          thesis_grade: "correct",
          timing_grade: null,
          sizing_grade: null,
          risk_management_grade: null,
          lessons: "n/a",
          actor_name: null,
          horizon_days,
        })),
      ]),
    ),
}));

const { getCalibrationStatus } = await import("./calibration");

const db = {} as DbClient;

beforeEach(() => {
  for (const key of Object.keys(ELAPSED)) delete ELAPSED[key];
  for (const key of Object.keys(OUTCOMES)) delete OUTCOMES[key];
});

describe("getCalibrationStatus", () => {
  it("owes nothing while no horizon has elapsed", async () => {
    const body = await getCalibrationStatus(db);
    expect(body.due_count).toBe(0);
    expect(body.graded.total).toBe(0);
  });

  it("lists the whole worklist with the id the write path takes", async () => {
    ELAPSED["d-enter"] = [30];
    ELAPSED["d-hold"] = [30];
    const body = await getCalibrationStatus(db);

    expect(body.due_count).toBe(2);
    expect(body.due.map((row) => row.decision_id).sort()).toEqual([
      "d-enter",
      "d-hold",
    ]);
    expect(body.due.every((row) => row.due_horizons.includes(30))).toBe(true);
  });

  it("splits what is owed by class rather than pooling it", async () => {
    ELAPSED["d-enter"] = [30];
    ELAPSED["d-hold"] = [30];
    const body = await getCalibrationStatus(db);
    expect(body.due_by_class).toEqual({
      position_originating: 1,
      continuation: 1,
    });
  });

  it("drops a decision from the worklist once its horizon is graded", async () => {
    ELAPSED["d-enter"] = [30];
    ELAPSED["d-hold"] = [30];
    OUTCOMES["d-enter"] = [30];
    const body = await getCalibrationStatus(db);

    expect(body.due.map((row) => row.decision_id)).toEqual(["d-hold"]);
    expect(body.graded.total).toBe(1);
    expect(body.graded.distinct_decisions).toBe(1);
    expect(body.graded.by_horizon).toEqual({ "30": 1 });
  });

  /**
   * The mistake no constraint can catch: the unique index stops the same
   * (decision_id, horizon) twice, but two grades on one decision at different
   * horizons while another decision got none is a valid set of rows. A distinct
   * count below the batch size is how it shows.
   */
  it("reports distinct decisions, so a grade on the wrong row is visible", async () => {
    ELAPSED["d-enter"] = [30, 90];
    ELAPSED["d-hold"] = [30];
    OUTCOMES["d-enter"] = [30, 90];
    const body = await getCalibrationStatus(db);

    expect(body.graded.total).toBe(2);
    expect(body.graded.distinct_decisions).toBe(1);
    expect(body.due.map((row) => row.decision_id)).toEqual(["d-hold"]);
  });

  it("counts an off-clock observation apart from the clocked grades", async () => {
    ELAPSED["d-enter"] = [30];
    OUTCOMES["d-enter"] = [null];
    const body = await getCalibrationStatus(db);

    expect(body.graded.by_horizon).toEqual({ off_clock: 1 });
    // An off-clock note is not the 30-day grade, so 30 is still owed.
    expect(body.due.map((row) => row.decision_id)).toContain("d-enter");
  });

  it("reports a fill-anchored decision with no fill instead of omitting it", async () => {
    ELAPSED["d-enter"] = [30];
    const body = await getCalibrationStatus(db);

    expect(body.ungradeable_count).toBe(1);
    expect(body.ungradeable[0]).toMatchObject({
      decision_id: "d-nofill",
      symbol: "SNDK",
      ungradeable_reason: "no_fill",
    });
    // And it is not silently counted as owed.
    expect(body.due.map((row) => row.decision_id)).not.toContain("d-nofill");
  });

  it("does not call a watch ungradeable — it anchors on action_at", async () => {
    const body = await getCalibrationStatus(db);
    expect(
      body.ungradeable.map((row) => row.decision_id),
    ).not.toContain("d-watch");
  });
});
