import { describe, expect, it, vi } from "vitest";

import type { DbClient } from "@/lib/supabase/db";
import { listDecisions } from "./decisions";

vi.mock("@/lib/data/research", () => ({
  listInstrumentsWithThemes: async () => [],
}));

/**
 * PostgREST caps a response at 1,000 rows and says nothing about it, so an
 * unbounded select returns a short list that looks complete. At 57 decisions
 * that is years away — but this feeds the grading worklist now, and a silently
 * truncated list means decisions owed a grade never appear at all.
 */
function db(total: number, pages: number[][]): DbClient {
  return {
    from(table: string) {
      if (table === "decisions") {
        return {
          select: () => ({
            order: () => ({
              range: async (from: number) => {
                const page = pages[Math.floor(from / 1000)] ?? [];
                return {
                  data: page.map((n) => ({
                    id: `d-${n}`,
                    instrument_id: null,
                    decision_type: "hold",
                    thesis: "t",
                    catalysts: null,
                    risks: null,
                    invalidation: null,
                    sizing_rationale: null,
                    action_at: "2026-08-12T00:00:00Z",
                    outcome_notes: null,
                    outcome_grade: null,
                    reviewed_at: null,
                    dossier_version_id: null,
                    created_at: "2026-08-12T00:00:00Z",
                  })),
                  error: null,
                };
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected ${table} (total ${total})`);
    },
  } as unknown as DbClient;
}

const full = Array.from({ length: 1000 }, (_, i) => i);

describe("listDecisions paging", () => {
  it("returns a short first page without asking for another", async () => {
    const rows = await listDecisions(db(3, [[1, 2, 3]]));
    expect(rows).toHaveLength(3);
  });

  it("keeps reading past the 1,000-row cap", async () => {
    // The failure it guards: a full page is exactly where PostgREST stops, and
    // stopping there loses every decision after it with no error.
    const rows = await listDecisions(db(1200, [full, [1, 2]]));
    expect(rows).toHaveLength(1002);
  });

  it("stops on the first short page rather than looping", async () => {
    const rows = await listDecisions(db(2000, [full, full, []]));
    expect(rows).toHaveLength(2000);
  });
});
