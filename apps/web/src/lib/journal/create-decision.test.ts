import { describe, expect, it } from "vitest";

import { createDecision } from "./create-decision";
import type { DbClient } from "@/lib/supabase/db";

function mockClient(args: {
  instrumentId: string;
  versionId: string;
  inserted?: Record<string, unknown>;
}): DbClient {
  const inserted: Record<string, unknown>[] = [];
  const client = {
    from(table: string) {
      return {
        select() {
          const chain = {
            eq() {
              return chain;
            },
            maybeSingle: async () => {
              if (table === "instruments") {
                return {
                  data: { id: args.instrumentId, symbol: "MRCY" },
                  error: null,
                };
              }
              if (table === "dossiers") {
                return {
                  data: {
                    id: "dossier-1",
                    catalysts: "cat",
                    risks: "risk",
                    invalidation: "inv",
                  },
                  error: null,
                };
              }
              if (table === "dossier_versions") {
                return {
                  data: { id: args.versionId, version_number: 3 },
                  error: null,
                };
              }
              return { data: null, error: null };
            },
            order() {
              return {
                limit() {
                  return {
                    maybeSingle: async () => ({
                      data: { id: args.versionId, version_number: 3 },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
          return chain;
        },
        update() {
          return {
            eq() {
              return {
                eq: async () => ({ error: null }),
              };
            },
          };
        },
        insert(values: Record<string, unknown>) {
          inserted.push(values);
          args.inserted = values;
          return {
            select() {
              return {
                single: async () => ({
                  data: {
                    id: "decision-1",
                    dossier_version_id: values.dossier_version_id,
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
  return client as unknown as DbClient;
}

describe("createDecision", () => {
  it("pins the current dossier_version_id and ignores client version ids", async () => {
    const stored: Record<string, unknown> = {};
    const supabase = mockClient({
      instrumentId: "inst-1",
      versionId: "ver-3",
      inserted: stored,
    });
    const created = await createDecision(supabase, {
      symbol: "MRCY",
      decision_type: "hold",
      thesis: "Keep holding through the print.",
    });
    expect(created.dossier_version).toEqual({ id: "ver-3", number: 3 });
    expect(created.id).toBe("decision-1");
  });
});
