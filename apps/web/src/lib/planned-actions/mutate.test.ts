import { describe, expect, it } from "vitest";

import { AgentApiError } from "@/lib/api/agent/errors";
import { assertNotTransactionMutation } from "./mutate";

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
});
