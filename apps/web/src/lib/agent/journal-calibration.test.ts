import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentApiError } from "@/lib/api/agent/errors";
import type { DbClient } from "@/lib/supabase/db";

import { MATERIAL_DECISION_TYPES, getAgentJournal } from "./journal";

/**
 * Ritual 12 asks "which material decisions have not been calibrated yet".
 * Before these filters that question had no answer: the absence of a child
 * outcome row is not a column, so the agent had to page the whole journal and
 * eyeball it. 0 outcomes across 48 decisions is what that costs.
 */

const DECISIONS = [
  { id: "d-enter-graded", decision_type: "enter", symbol: "CRDO", action_at: "2026-08-20T14:00:00Z" },
  { id: "d-enter-open", decision_type: "enter", symbol: "VRT", action_at: "2026-08-19T14:00:00Z" },
  { id: "d-add-open", decision_type: "add", symbol: "NBIS", action_at: "2026-08-18T14:00:00Z" },
  { id: "d-reduce-open", decision_type: "reduce", symbol: "CLS", action_at: "2026-08-17T14:00:00Z" },
  { id: "d-exit-open", decision_type: "exit", symbol: "SMCI", action_at: "2026-08-16T14:00:00Z" },
  { id: "d-hold-open", decision_type: "hold", symbol: "CRDO", action_at: "2026-08-15T14:00:00Z" },
  { id: "d-watch-open", decision_type: "watch", symbol: "ALAB", action_at: "2026-08-14T14:00:00Z" },
];

const GRADED = ["d-enter-graded"];

vi.mock("@/lib/data/decisions", () => ({
  listDecisions: async () => DECISIONS,
}));

/**
 * Which horizons have elapsed, per decision. Drives the horizon_due tests below;
 * the default is "nothing has elapsed", which is what the other tests assume.
 */
const ELAPSED: Record<string, number[]> = {};

/** Outcome timestamps per decision, so a grade can be placed before or after a target. */
const OUTCOMES: Record<string, string[]> = {};

vi.mock("@/lib/data/decision-returns", () => ({
  loadDecisionRelativeReturns: async (
    _db: unknown,
    rows: Array<{ id: string }>,
  ) =>
    new Map(
      rows.map((row) => [
        row.id,
        {
          method: "close_to_close",
          decisionClass: "continuation",
          anchor: null,
          fill: null,
          reason: null,
          horizons: [30, 90, 180].map((days) => ({
            days,
            start: "2026-06-01",
            target: `2026-06-0${days === 30 ? 2 : days === 90 ? 3 : 4}`,
            asOf: "2026-06-01",
            complete: (ELAPSED[row.id] ?? []).includes(days),
            tickerReturn: null,
            spyReturn: null,
            vsSpy: null,
          })),
        },
      ]),
    ),
}));

vi.mock("@/lib/data/price-freshness", () => ({
  loadSuccessBenchmarkThrough: async () => "2026-09-04",
  freshnessPayload: () => ({ price_data_through: "2026-09-04", price_data_stale: false }),
}));

function fakeDb(): DbClient {
  return {
    from(table: string) {
      if (table !== "decision_outcomes") throw new Error(`unexpected ${table}`);
      return {
        select() {
          return {
            // gradedDecisionIds pages with .range()
            range: async () => ({
              data: GRADED.map((id) => ({ decision_id: id })),
              error: null,
            }),
            // listDecisionOutcomes chains .in().order()
            in: () => ({
              order: async () => ({
                data: Object.entries(OUTCOMES).flatMap(([id, stamps]) =>
                  stamps.map((recorded_at, i) => ({
                    id: `${id}-o${i}`,
                    decision_id: id,
                    recorded_at,
                    thesis_grade: "correct",
                    timing_grade: null,
                    sizing_grade: null,
                    risk_management_grade: null,
                    lessons: "n/a",
                    actor_name: null,
                  })),
                ),
                error: null,
              }),
            }),
          };
        },
      };
    },
  } as unknown as DbClient;
}

const ids = (body: { entries: Array<{ id: string }> }) =>
  body.entries.map((e) => e.id);

beforeEach(() => {
  for (const key of Object.keys(ELAPSED)) delete ELAPSED[key];
  for (const key of Object.keys(OUTCOMES)) delete OUTCOMES[key];
});

describe("getAgentJournal calibration filters", () => {
  it("lists the decisions still needing an outcome", async () => {
    const body = await getAgentJournal(fakeDb(), { graded: "false" });
    expect(ids(body)).not.toContain("d-enter-graded");
    expect(ids(body)).toContain("d-enter-open");
    expect(body.count).toBe(DECISIONS.length - GRADED.length);
  });

  it("lists the ones already graded", async () => {
    const body = await getAgentJournal(fakeDb(), { graded: "true" });
    expect(ids(body)).toEqual(["d-enter-graded"]);
  });

  it("returns everything when graded is not asked for", async () => {
    const body = await getAgentJournal(fakeDb(), {});
    expect(body.count).toBe(DECISIONS.length);
  });

  it("builds the quarterly calibration worklist in one call", async () => {
    // The shape ritual 12 actually needs: material types, not yet graded.
    const body = await getAgentJournal(fakeDb(), {
      decision_type: "material",
      graded: "false",
    });
    expect(ids(body)).toEqual([
      "d-enter-open",
      "d-add-open",
      "d-reduce-open",
      "d-exit-open",
    ]);
    // Weekly holds and watches are not calibration material.
    expect(ids(body)).not.toContain("d-hold-open");
    expect(ids(body)).not.toContain("d-watch-open");
  });

  it("treats material as exactly enter, add, reduce, exit", () => {
    // Spelling the set out by hand is how `reduce` gets quietly dropped.
    expect(MATERIAL_DECISION_TYPES).toEqual(["enter", "add", "reduce", "exit"]);
  });

  it("accepts a comma-separated list", async () => {
    const body = await getAgentJournal(fakeDb(), { decision_type: "exit,hold" });
    expect(ids(body)).toEqual(["d-exit-open", "d-hold-open"]);
  });

  it("dedupes overlapping types rather than repeating rows", async () => {
    const body = await getAgentJournal(fakeDb(), {
      decision_type: "material,enter",
    });
    expect(ids(body).filter((id) => id === "d-enter-graded")).toHaveLength(1);
  });

  it("filters graded before paging, not after", async () => {
    // The bug this guards: slicing first would return an under-full page and
    // silently hide ungraded rows behind a cursor.
    const body = await getAgentJournal(fakeDb(), { graded: "false", limit: 6 });
    expect(body.count).toBe(6);
    expect(ids(body)).not.toContain("d-enter-graded");
  });

  it("rejects a graded value that is not a boolean", async () => {
    await expect(
      getAgentJournal(fakeDb(), { graded: "sort-of" }),
    ).rejects.toBeInstanceOf(AgentApiError);
  });

  it("rejects an unknown decision_type", async () => {
    await expect(
      getAgentJournal(fakeDb(), { decision_type: "enter,fiddled" }),
    ).rejects.toBeInstanceOf(AgentApiError);
  });
});

/**
 * The gap the learning loop actually had: 57 decisions, 0 grades, and no
 * mechanical way to ask what was owed. `graded=false` is not that question --
 * it answers "never graded at all", which is a different set the moment any
 * decision is graded once.
 */
describe("getAgentJournal horizon_due", () => {
  it("lists nothing while no horizon has elapsed", async () => {
    const body = await getAgentJournal(fakeDb(), { horizon_due: "true" });
    expect(ids(body)).toEqual([]);
  });

  it("lists a decision whose horizon elapsed with no grade after it", async () => {
    ELAPSED["d-hold-open"] = [30];
    const body = await getAgentJournal(fakeDb(), { horizon_due: "true" });
    expect(ids(body)).toEqual(["d-hold-open"]);
  });

  it("drops it once a grade is written after the target", async () => {
    ELAPSED["d-hold-open"] = [30];
    OUTCOMES["d-hold-open"] = ["2026-06-10T00:00:00.000Z"];
    const body = await getAgentJournal(fakeDb(), { horizon_due: "true" });
    expect(ids(body)).toEqual([]);
  });

  it("brings it back at 90 after a 30-day grade", async () => {
    // The distinction from graded=false, which would have hidden this decision
    // permanently at its first grade.
    ELAPSED["d-hold-open"] = [30, 90];
    OUTCOMES["d-hold-open"] = ["2026-06-02T12:00:00.000Z"];
    const due = await getAgentJournal(fakeDb(), { horizon_due: "true" });
    expect(ids(due)).toEqual(["d-hold-open"]);

    const neverGraded = await getAgentJournal(fakeDb(), { graded: "false" });
    expect(ids(neverGraded)).toContain("d-hold-open");
    expect(
      due.entries[0]?.relative_returns?.due_horizons,
    ).toEqual([90]);
  });

  it("grades continuation decisions too, not just the material set", async () => {
    // Every eligible decision faces the clock; leaving the 42 holds outside it
    // would put selection bias inside the instrument built to detect it.
    ELAPSED["d-hold-open"] = [30];
    ELAPSED["d-enter-open"] = [30];
    const body = await getAgentJournal(fakeDb(), { horizon_due: "true" });
    expect(ids(body)).toEqual(["d-enter-open", "d-hold-open"]);
  });

  it("horizon_due=false is the complement, applied before paging", async () => {
    ELAPSED["d-hold-open"] = [30];
    const body = await getAgentJournal(fakeDb(), { horizon_due: "false" });
    expect(ids(body)).not.toContain("d-hold-open");
    expect(body.count).toBe(DECISIONS.length - 1);
  });

  it("rejects a horizon_due value that is not a boolean, by name", async () => {
    await expect(
      getAgentJournal(fakeDb(), { horizon_due: "soon" }),
    ).rejects.toThrow(/horizon_due/);
  });
});
