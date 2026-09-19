import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The 18 September review's first P0: `confirmPlannedAction` loaded the queue row
 * without `action_type` and called `bookFill()` unconditionally, so confirming a
 * queued `reduce`/`sell` would have inserted a **buy** — debiting cash and
 * increasing the position the row was written to cut — and then marked the sale
 * confirmed. Unwinding that needs a manual ledger reversal.
 *
 * It was refused outright while the sell path was built. Now it routes: a sale
 * goes through `bookSell`, a purchase through `bookFill`, and the tests assert
 * each reaches one and only one of them. Direction is the whole finding, so a
 * test that only checks a sale succeeds would miss a regression that booked it
 * as a buy and returned ok.
 */

const bookFill = vi.fn();
const bookSell = vi.fn();
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

vi.mock("@/lib/actions/sell-position", () => ({
  bookSell: (args: unknown) => {
    bookSell(args);
    return Promise.resolve({
      ok: true,
      positionId: "pos-1",
      decisionId: "dec-1",
      isFullExit: false,
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
  bookSell.mockClear();
  redirected.length = 0;
  queueUpdates.length = 0;
  bookedTransaction = null;
  plannedRow = null;
});

describe("confirmPlannedAction", () => {
  for (const actionType of ["sell", "reduce"] as const) {
    it(`books a queued ${actionType} through the sell path, not bookFill`, async () => {
      plannedRow = {
        id: "pa-1",
        instrument_id: "instr-vrt",
        action_type: actionType,
        status: "pending",
        rationale: "Diagnostic says trim.",
      };

      await expect(
        confirmPlannedAction({ error: null }, form()),
      ).rejects.toBeInstanceOf(Redirect);

      // The finding was direction, so assert the negative too: a sale that
      // reached bookFill would debit cash and grow the position.
      expect(bookFill).not.toHaveBeenCalled();
      expect(bookSell).toHaveBeenCalledTimes(1);
      expect(bookSell.mock.calls[0]?.[0]).toMatchObject({
        instrumentId: "instr-vrt",
        quantity: 10,
        price: 250,
        // Carried onto the ledger row, which is what brings a sale under the
        // planned-action unique index and makes a retry repair instead of
        // booking a second exit.
        plannedActionId: "pa-1",
      });
      expect(queueUpdates[0]).toMatchObject({
        status: "confirmed",
        confirmed_quantity: 10,
      });
    });
  }

  it("does not reach the sell path with a buy", async () => {
    plannedRow = {
      id: "pa-1",
      instrument_id: "instr-vrt",
      action_type: "buy",
      status: "pending",
      rationale: "Starter tranche.",
    };

    await expect(
      confirmPlannedAction({ error: null }, form()),
    ).rejects.toBeInstanceOf(Redirect);
    expect(bookSell).not.toHaveBeenCalled();
  });

  // The buy path must be untouched by the routing.
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
