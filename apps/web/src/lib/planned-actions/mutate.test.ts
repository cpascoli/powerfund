import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentApiError } from "@/lib/api/agent/errors";
import type { DbClient } from "@/lib/supabase/db";

type GateCall = { instrumentId: string; costUsd: number; side: string };

const gateCalls: GateCall[] = [];
let gateBlocks = false;

vi.mock("@/lib/mandate/enforce", () => ({
  mandateGate: async (args: GateCall) => {
    gateCalls.push({
      instrumentId: args.instrumentId,
      costUsd: args.costUsd,
      side: args.side,
    });
    return gateBlocks
      ? { ok: false, error: "Mandate blocked.", violations: [] }
      : { ok: true, violations: [] };
  },
}));

vi.mock("@/lib/data/portfolio", () => ({
  getOpenPortfolioBook: async () => ({ nav: 250_000 }),
}));

const {
  assertNotTransactionMutation,
  createPlannedAction,
  updatePlannedAction,
} = await import("./mutate");

const ROW = {
  id: "pa-1",
  instrument_id: "instr-vrt",
  action_type: "sell" as string,
  status: "cancelled" as string,
  planned_usd: 5_000,
  window_label: null,
  due_by: null,
  rationale: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

let row: Record<string, unknown> = { ...ROW };
const writes: Record<string, unknown>[] = [];

function db(): DbClient {
  const client = {
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () =>
              table === "instruments"
                ? { data: { id: "instr-vrt", symbol: "VRT" }, error: null }
                : { data: row, error: null },
          }),
        }),
        insert: (values: Record<string, unknown>) => {
          writes.push({ op: "insert", table, ...values });
          return {
            select: () => ({
              single: async () => ({
                data: { ...ROW, ...values },
                error: null,
              }),
            }),
          };
        },
        update: (values: Record<string, unknown>) => {
          writes.push({ op: "update", table, ...values });
          return {
            eq: () => ({
              select: () => ({
                single: async () => ({
                  data: { ...ROW, ...values },
                  error: null,
                }),
              }),
            }),
          };
        },
      };
    },
  };
  return client as unknown as DbClient;
}

beforeEach(() => {
  gateCalls.length = 0;
  writes.length = 0;
  gateBlocks = false;
  row = { ...ROW };
});

describe("planned action mutations", () => {
  it("rejects fill/ledger fields so agents cannot book transactions", () => {
    try {
      assertNotTransactionMutation({
        symbol: "CLS",
        action_type: "add",
        quantity: 10,
        price: 290,
      });
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentApiError);
      expect((error as AgentApiError).status).toBe(422);
      expect((error as AgentApiError).details.rejected_fields).toEqual(
        expect.arrayContaining(["quantity", "price"]),
      );
    }
  });

  /**
   * Live rows reached `[agent:chatgpt]\n[agent:chatgpt]\n…` because a PATCH that
   * changed anything else re-stamped the stored rationale, which already had a
   * tag. The newest tag is the only informative one — prepending puts the most
   * recent writer first.
   */
  it("stamps the actor once, however many times a row is patched", async () => {
    row = { ...ROW, status: "pending", rationale: "Original body." };
    await updatePlannedAction(db(), "pa-1", {
      due_by: "2026-10-01",
      actor_name: "chatgpt",
    });
    const first = writes.at(-1)?.rationale as string;
    expect(first).toBe("[agent:chatgpt]\nOriginal body.");

    // Re-stamping the already-stamped text is where the stack used to grow.
    row = { ...ROW, status: "pending", rationale: first };
    await updatePlannedAction(db(), "pa-1", {
      due_by: "2026-10-02",
      actor_name: "chatgpt",
    });
    expect(writes.at(-1)?.rationale).toBe("[agent:chatgpt]\nOriginal body.");
  });

  it("replaces another agent's tag rather than stacking on it", async () => {
    row = {
      ...ROW,
      status: "pending",
      rationale: "[agent:chatgpt]\nOriginal body.",
    };
    await updatePlannedAction(db(), "pa-1", {
      due_by: "2026-10-03",
      actor_name: "PowerFundAgent",
    });
    expect(writes.at(-1)?.rationale).toBe(
      "[agent:PowerFundAgent]\nOriginal body.",
    );
  });

  it("leaves the text alone when no actor is given", async () => {
    row = { ...ROW, status: "pending", rationale: "[agent:chatgpt]\nBody." };
    await updatePlannedAction(db(), "pa-1", { due_by: "2026-10-04" });
    expect(writes.at(-1)?.rationale).toBe("[agent:chatgpt]\nBody.");
  });

  it("stamps the caller's actor_name onto a new rationale", async () => {
    await createPlannedAction(db(), {
      symbol: "VRT",
      action_type: "buy",
      planned_usd: 2_000,
      rationale: "Starter only.",
      actor_name: "PowerFundAgent",
    });
    expect(writes.at(-1)?.rationale).toBe(
      "[agent:PowerFundAgent]\nStarter only.",
    );
  });

  it("does not invent an actor when the caller sends none", async () => {
    await createPlannedAction(db(), {
      symbol: "VRT",
      action_type: "buy",
      planned_usd: 2_000,
      rationale: "Starter only.",
    });
    expect(writes.at(-1)?.rationale).toBe("Starter only.");
  });

  it("tells the gate which side each action type is", async () => {
    for (const [actionType, side] of [
      ["buy", "buy"],
      ["add", "buy"],
      ["reduce", "sell"],
      ["sell", "sell"],
    ] as const) {
      gateCalls.length = 0;
      await createPlannedAction(db(), {
        symbol: "VRT",
        action_type: actionType,
        planned_usd: 5_000,
      });
      expect(gateCalls).toHaveLength(1);
      expect(gateCalls[0]?.side).toBe(side);
    }
  });

  /**
   * A cancelled action is exempt from the open-status check so it can be revived.
   * It was last gated against a book that has since moved, so the revival itself
   * has to re-run the gate — previously it ran only when the amount or the type
   * changed, and a bare `{ status: "pending" }` changes neither.
   */
  it("re-runs the gate when a cancelled action is revived to pending", async () => {
    await updatePlannedAction(db(), "pa-1", { status: "pending" });

    expect(gateCalls).toHaveLength(1);
    expect(gateCalls[0]?.side).toBe("sell");
  });

  it("blocks the revival when the gate refuses it", async () => {
    gateBlocks = true;

    await expect(
      updatePlannedAction(db(), "pa-1", { status: "pending" }),
    ).rejects.toBeInstanceOf(AgentApiError);
    expect(writes).toEqual([]);
  });

  /**
   * The direction to gate on is the one being asked for now. Reading it off the
   * stored row would let a `sell` — which skips the caps — be flipped to a `buy`
   * that has never met one.
   */
  it("gates a sell flipped to a buy as a buy", async () => {
    await updatePlannedAction(db(), "pa-1", {
      status: "pending",
      action_type: "buy",
    });

    expect(gateCalls).toHaveLength(1);
    expect(gateCalls[0]?.side).toBe("buy");
  });

  it("does not re-gate an edit that changes neither amount, type, nor openness", async () => {
    row = { ...ROW, status: "pending" };

    await updatePlannedAction(db(), "pa-1", { rationale: "Tidied wording." });

    expect(gateCalls).toEqual([]);
  });

  it("refuses to reopen a confirmed action, which has a ledger entry behind it", async () => {
    row = { ...ROW, status: "confirmed" };

    await expect(
      updatePlannedAction(db(), "pa-1", { status: "pending" }),
    ).rejects.toBeInstanceOf(AgentApiError);
    expect(writes).toEqual([]);
  });
});
