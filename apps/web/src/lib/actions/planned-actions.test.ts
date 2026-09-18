import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The 18 September review's first P0: `confirmPlannedAction` loaded the queue row
 * without `action_type` and called `bookFill()` unconditionally, so confirming a
 * queued `reduce`/`sell` would have inserted a **buy** — debiting cash and
 * increasing the position the row was written to cut — and then marked the sale
 * confirmed. Unwinding that needs a manual ledger reversal.
 *
 * The operator form cannot create a sell (`savePlannedAction` coerces to
 * buy/add), but the agent API accepts both, so such a row can reach this queue.
 * Until the confirm path routes by direction, it refuses them here. The rule used
 * to live only in CLAUDE.md, where the code could not read it.
 */

const bookFill = vi.fn();
const redirected: string[] = [];

/** Only the reads and writes this action performs, in the shape it performs them. */
let plannedRow: Record<string, unknown> | null = null;
let bookedTransaction: Record<string, unknown> | null = null;
const queueUpdates: Record<string, unknown>[] = [];

class Redirect extends Error {}

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    redirected.push(to);
    throw new Redirect(to);
  },
}));

vi.mock("@/lib/auth/operator", () => ({
  requireOperator: async () => null,
}));

vi.mock("@/lib/actions/book-fill", () => ({
  bookFill: (args: unknown) => {
    bookFill(args);
    return Promise.resolve({
      ok: true,
      positionId: "pos-1",
      decisionId: "dec-1",
    });
  },
}));

vi.mock("@/lib/planned-actions/mutate", () => ({
  createPlannedAction: async () => ({ id: "pa-1" }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () =>
              table === "planned_actions"
                ? { data: plannedRow, error: null }
                : { data: bookedTransaction, error: null },
          }),
        }),
        update: (values: Record<string, unknown>) => ({
          eq: async () => {
            queueUpdates.push({ table, ...values });
            return { error: null };
          },
        }),
      };
    },
  }),
}));

const { confirmPlannedAction } = await import("./planned-actions");

function form(): FormData {
  const data = new FormData();
  data.set("id", "pa-1");
  data.set("quantity", "10");
  data.set("price", "250");
  return data;
}

beforeEach(() => {
  bookFill.mockClear();
  redirected.length = 0;
  queueUpdates.length = 0;
  bookedTransaction = null;
  plannedRow = null;
});

describe("confirmPlannedAction", () => {
  for (const actionType of ["sell", "reduce"] as const) {
    it(`refuses a queued ${actionType} instead of booking it as a buy`, async () => {
      plannedRow = {
        id: "pa-1",
        instrument_id: "instr-vrt",
        action_type: actionType,
        status: "pending",
        rationale: "Diagnostic says trim.",
      };

      const result = await confirmPlannedAction({ error: null }, form());

      expect(result.error).toMatch(new RegExp(actionType, "i"));
      // The assertions that matter: no money moved and the row was not marked
      // confirmed, so the sale is still there to be handled properly.
      expect(bookFill).not.toHaveBeenCalled();
      expect(queueUpdates).toEqual([]);
      expect(redirected).toEqual([]);
    });
  }

  // The refusal above is only correct if the queue still works. A blanket
  // rejection would satisfy every assertion in this file but the ones below.
  for (const actionType of ["buy", "add"] as const) {
    it(`still books a queued ${actionType} through bookFill`, async () => {
      plannedRow = {
        id: "pa-1",
        instrument_id: "instr-vrt",
        action_type: actionType,
        status: "pending",
        rationale: "Starter tranche.",
      };

      await expect(
        confirmPlannedAction({ error: null }, form()),
      ).rejects.toBeInstanceOf(Redirect);

      expect(bookFill).toHaveBeenCalledTimes(1);
      expect(bookFill.mock.calls[0]?.[0]).toMatchObject({
        instrumentId: "instr-vrt",
        quantity: 10,
        avgCost: 250,
        plannedActionId: "pa-1",
      });
      expect(queueUpdates[0]).toMatchObject({
        table: "planned_actions",
        status: "confirmed",
        confirmed_quantity: 10,
        confirmed_price: 250,
      });
      expect(redirected).toEqual(["/portfolio?tab=book"]);
    });
  }
});
