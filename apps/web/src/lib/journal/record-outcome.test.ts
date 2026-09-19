import { describe, expect, it } from "vitest";

import { AgentApiError } from "@/lib/api/agent/errors";
import type { DbClient } from "@/lib/supabase/db";

import {
  assertNotDecisionPatch,
  recordDecisionOutcome,
} from "./record-outcome";

function mockClient(args: {
  decisionId: string | null;
  inserted?: Record<string, unknown>;
}): DbClient {
  const client = {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => {
                  if (table === "decisions") {
                    return args.decisionId
                      ? { data: { id: args.decisionId }, error: null }
                      : { data: null, error: null };
                  }
                  return { data: null, error: null };
                },
              };
            },
          };
        },
        insert(values: Record<string, unknown>) {
          Object.assign(args.inserted ?? {}, { table, ...values });
          return {
            select() {
              return {
                single: async () => ({
                  data: {
                    id: "outcome-1",
                    decision_id: values.decision_id,
                    recorded_at: "2026-08-22T12:00:00.000Z",
                    thesis_grade: values.thesis_grade,
                    timing_grade: values.timing_grade ?? null,
                    sizing_grade: values.sizing_grade ?? null,
                    risk_management_grade:
                      values.risk_management_grade ?? null,
                    lessons: values.lessons,
                    actor_name: values.actor_name ?? null,
                    horizon_days: values.horizon_days ?? null,
                  },
                  error: null,
                }),
              };
            },
          };
        },
        update() {
          throw new Error("decision_outcomes must not be updated");
        },
      };
    },
  };
  return client as unknown as DbClient;
}

describe("recordDecisionOutcome", () => {
  it("rejects reviewed_at and fill fields so the original row stays immutable", () => {
    try {
      assertNotDecisionPatch({
        thesis_grade: "correct",
        lessons: "ok",
        reviewed_at: "2026-08-22T00:00:00Z",
        quantity: 10,
      });
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentApiError);
      expect((error as AgentApiError).status).toBe(422);
      expect((error as AgentApiError).details.rejected_fields).toEqual(
        expect.arrayContaining(["reviewed_at", "quantity"]),
      );
    }
  });

  it("inserts a child row and does not patch decisions", async () => {
    const stored: Record<string, unknown> = {};
    const supabase = mockClient({
      decisionId: "dec-1",
      inserted: stored,
    });
    const recorded = await recordDecisionOutcome(supabase, "dec-1", {
      thesis_grade: "correct",
      timing_grade: "poor",
      lessons: "Right company, chased the first print.",
      actor_name: "chatgpt",
      horizon_days: 30,
    });
    expect(recorded.id).toBe("outcome-1");
    expect(recorded.decision_id).toBe("dec-1");
    expect(stored.table).toBe("decision_outcomes");
    expect(stored.thesis_grade).toBe("correct");
    expect(stored.timing_grade).toBe("poor");
    expect(stored.horizon_days).toBe(30);
    expect(recorded.horizon_days).toBe(30);
    expect(stored).not.toHaveProperty("reviewed_at");
  });

  /**
   * The failure this guards is silent rather than loud: an omitted horizon used
   * to be stored as null, so a caller grading the 30-day checkpoint would write
   * an off-clock observation, leave the horizon owed, and see no error saying so.
   */
  it("refuses an omitted horizon rather than filing the grade off-clock", async () => {
    const stored: Record<string, unknown> = {};
    const supabase = mockClient({ decisionId: "dec-1", inserted: stored });
    await expect(
      recordDecisionOutcome(supabase, "dec-1", {
        thesis_grade: "correct",
        lessons: "Graded, but against which clock?",
        horizon_days: undefined,
      }),
    ).rejects.toBeInstanceOf(AgentApiError);
    expect(stored).toEqual({});
  });

  it("accepts an explicit null as a deliberate off-clock observation", async () => {
    const stored: Record<string, unknown> = {};
    const supabase = mockClient({ decisionId: "dec-1", inserted: stored });
    const recorded = await recordDecisionOutcome(supabase, "dec-1", {
      thesis_grade: "wrong",
      lessons: "Invalidation hit at day 12, well before the first checkpoint.",
      horizon_days: null,
    });
    expect(stored.horizon_days).toBeNull();
    expect(recorded.horizon_days).toBeNull();
  });

  it("rejects a horizon that is not one of the three", async () => {
    const supabase = mockClient({ decisionId: "dec-1" });
    await expect(
      recordDecisionOutcome(supabase, "dec-1", {
        thesis_grade: "correct",
        lessons: "A horizon nobody agreed to.",
        horizon_days: 45,
      }),
    ).rejects.toBeInstanceOf(AgentApiError);
  });

  it("404s when the decision does not exist", async () => {
    const supabase = mockClient({ decisionId: null });
    try {
      await recordDecisionOutcome(supabase, "missing", {
        thesis_grade: "wrong",
        lessons: "Never bought.",
        horizon_days: null,
      });
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentApiError);
      expect((error as AgentApiError).code).toBe("UNKNOWN_DECISION");
    }
  });
});
