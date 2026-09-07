import { describe, expect, it, vi } from "vitest";

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

vi.mock("@/lib/data/decision-returns", () => ({
  loadDecisionRelativeReturns: async () => new Map(),
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
              order: async () => ({ data: [], error: null }),
            }),
          };
        },
      };
    },
  } as unknown as DbClient;
}

const ids = (body: { entries: Array<{ id: string }> }) =>
  body.entries.map((e) => e.id);

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
