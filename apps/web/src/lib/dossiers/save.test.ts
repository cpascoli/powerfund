import { describe, expect, it } from "vitest";

import { parseDossierPatch } from "./save";
import { AgentApiError } from "@/lib/api/agent/errors";

describe("parseDossierPatch", () => {
  it("rejects unknown fields (no mass assignment)", () => {
    try {
      parseDossierPatch("MRCY", {
        change_reason: "test",
        changes: { summary: "ok", quantity: 12 },
      });
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentApiError);
      expect((error as AgentApiError).status).toBe(422);
    }
  });

  it("requires a change_reason", () => {
    try {
      parseDossierPatch("MRCY", { changes: { summary: "ok" } });
      throw new Error("expected throw");
    } catch (error) {
      expect((error as AgentApiError).code).toBe("VALIDATION_ERROR");
    }
  });
});
