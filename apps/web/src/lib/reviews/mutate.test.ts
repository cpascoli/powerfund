import { describe, expect, it } from "vitest";

import { AgentApiError } from "@/lib/api/agent/errors";

import { markReviewTasksDue } from "./evaluate";
import {
  assertNotLedgerMutation,
  assertPatchableReviewTaskStatus,
} from "./mutate";
import { matchTheme } from "./records";

describe("review task mutations", () => {
  it("rejects ledger fields so a trigger or complete cannot book a fill", () => {
    try {
      assertNotLedgerMutation({
        outcome: "bought the dip",
        quantity: 10,
        cash_delta: -1500,
      });
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentApiError);
      expect((error as AgentApiError).status).toBe(422);
      expect((error as AgentApiError).details.rejected_fields).toEqual(
        expect.arrayContaining(["quantity", "cash_delta"]),
      );
    }
  });

  it("does not allow PATCH to set due or completed", () => {
    try {
      assertPatchableReviewTaskStatus("due");
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentApiError);
      expect((error as AgentApiError).code).toBe("VALIDATION_ERROR");
    }
    try {
      assertPatchableReviewTaskStatus("completed");
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentApiError);
    }
    expect(() => assertPatchableReviewTaskStatus("in_progress")).not.toThrow();
  });

  it("marks due by updating only review_tasks", async () => {
    const tables: string[] = [];
    const supabase = {
      from(table: string) {
        tables.push(table);
        return {
          update: () => ({
            in: () => ({
              eq: () => ({
                select: async () => ({ data: [{ id: "task-1" }], error: null }),
              }),
            }),
          }),
        };
      },
    };
    const marked = await markReviewTasksDue(
      supabase as never,
      ["task-1"],
      new Date("2026-08-22T12:00:00.000Z"),
    );
    expect(marked).toBe(1);
    expect(tables).toEqual(["review_tasks"]);
  });

  it("accepts theme slugs or display names", () => {
    const themes = [
      { id: "1", slug: "ai-infrastructure", name: "AI Infrastructure" },
      { id: "2", slug: "energy", name: "Energy" },
    ];
    expect(matchTheme("ai-infrastructure", themes)?.slug).toBe(
      "ai-infrastructure",
    );
    expect(matchTheme("AI Infrastructure", themes)?.slug).toBe(
      "ai-infrastructure",
    );
    expect(matchTheme("energy", themes)?.slug).toBe("energy");
    expect(matchTheme("defence", themes)).toBeNull();
  });
});
