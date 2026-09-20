import { describe, expect, it } from "vitest";

import type { DbClient } from "@/lib/supabase/db";
import { bookedByClientKey } from "./already-booked";

/**
 * The retry this exists for is not a double-click so much as an honest one: both
 * booking paths write the ledger first and can still fail afterwards, returning
 * `{ ok: false }` with the money already moved. Resubmitting is the natural
 * response to that screen, and without a key it books the fill a second time.
 */
function db(args: {
  transaction?: { id: string; decision_id: string | null } | null;
  position?: { id: string } | null;
  decisionType?: string | null;
  seen?: string[];
}): DbClient {
  return {
    from(table: string) {
      args.seen?.push(table);
      return {
        select: () => ({
          eq: (_c: string, _v: unknown) => {
            const terminal = {
              maybeSingle: async () => {
                if (table === "transactions") {
                  return { data: args.transaction ?? null, error: null };
                }
                if (table === "positions") {
                  return { data: args.position ?? null, error: null };
                }
                return {
                  data: args.decisionType
                    ? { decision_type: args.decisionType }
                    : null,
                  error: null,
                };
              },
            };
            return {
              ...terminal,
              eq: () => ({ limit: () => terminal }),
            };
          },
        }),
      };
    },
  } as unknown as DbClient;
}

describe("bookedByClientKey", () => {
  it("returns nothing when the key has never been booked", async () => {
    const found = await bookedByClientKey(db({ transaction: null }), "k", "i");
    expect(found).toBeNull();
  });

  it("finds the fill a resubmit would otherwise duplicate", async () => {
    const found = await bookedByClientKey(
      db({
        transaction: { id: "tx-1", decision_id: "dec-1" },
        position: { id: "pos-1" },
        decisionType: "add",
      }),
      "k",
      "i",
    );
    expect(found).toMatchObject({
      transactionId: "tx-1",
      decisionId: "dec-1",
      decisionType: "add",
      positionId: "pos-1",
      positionOpen: true,
    });
  });

  it("reports a closed position as closed rather than as missing", async () => {
    // A resubmitted full exit: the sale happened and there is no open position,
    // which is the answer, not an absent one.
    const found = await bookedByClientKey(
      db({
        transaction: { id: "tx-2", decision_id: null },
        position: null,
      }),
      "k",
      "i",
    );
    expect(found?.positionOpen).toBe(false);
    expect(found?.positionId).toBeNull();
  });

  it("does not look up a decision when the fill logged none", async () => {
    const seen: string[] = [];
    await bookedByClientKey(
      db({ transaction: { id: "tx-3", decision_id: null }, seen }),
      "k",
      "i",
    );
    expect(seen).not.toContain("decisions");
  });
});
