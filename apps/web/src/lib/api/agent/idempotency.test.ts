import { describe, expect, it } from "vitest";

import { AgentApiError } from "./errors";
import { loadIdempotency, requestHash } from "./idempotency";
import type { DbClient } from "@/lib/supabase/db";

describe("idempotency", () => {
  it("replays a stored response for the same hash", async () => {
    const hash = requestHash("POST", "/api/v1/agent/decisions", '{"symbol":"MRCY"}');
    const supabase = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      maybeSingle: async () => ({
                        data: {
                          request_hash: hash,
                          status_code: 200,
                          response: { created: true, id: "decision-1" },
                        },
                        error: null,
                      }),
                    };
                  },
                };
              },
            };
          },
        };
      },
    } as unknown as DbClient;

    const replay = await loadIdempotency(supabase, "chatgpt", "key-1", hash);
    expect(replay).toEqual({
      status_code: 200,
      response: { created: true, id: "decision-1" },
    });
  });

  it("rejects a reused key with a different body", async () => {
    const supabase = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      maybeSingle: async () => ({
                        data: {
                          request_hash: "other",
                          status_code: 200,
                          response: {},
                        },
                        error: null,
                      }),
                    };
                  },
                };
              },
            };
          },
        };
      },
    } as unknown as DbClient;

    try {
      await loadIdempotency(supabase, "chatgpt", "key-1", "new-hash");
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentApiError);
      expect((error as AgentApiError).code).toBe("IDEMPOTENCY_KEY_REUSED");
    }
  });
});
