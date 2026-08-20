import { describe, expect, it } from "vitest";

import { AgentApiError } from "@/lib/api/agent/errors";
import { saveDossierVersioned } from "./save";
import type { DbClient } from "@/lib/supabase/db";

function mockSaveClient(args: {
  rpc: (params: Record<string, unknown>) => {
    data: unknown;
    error: { message: string; details?: string } | null;
  };
  live?: Record<string, unknown> | null;
}): DbClient {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => {
                  if (table === "instruments") {
                    return { data: { id: "inst-1", symbol: "MRCY" }, error: null };
                  }
                  return { data: args.live ?? null, error: null };
                },
              };
            },
          };
        },
      };
    },
    async rpc(_name: string, params: Record<string, unknown>) {
      return args.rpc(params);
    },
  } as unknown as DbClient;
}

describe("saveDossierVersioned", () => {
  const live = {
    id: "d-1",
    status: "investigate",
    summary: "Old",
    thesis: "T",
    catalysts: null,
    risks: null,
    invalidation: null,
    competitive_notes: null,
    next_diligence: null,
    source: null,
    research_level: "screened",
    as_of_at: null,
    verified_at: null,
    next_review_at: null,
  };

  it("returns the new version when the RPC reports a change", async () => {
    const result = await saveDossierVersioned(
      mockSaveClient({
        live,
        rpc: () => ({
          data: {
            changed: true,
            dossier_id: "d-1",
            version_id: "v-4",
            version_number: 4,
            change_reason: "earnings",
          },
          error: null,
        }),
      }),
      {
        symbol: "MRCY",
        change_reason: "earnings",
        changes: { summary: "New summary" },
      },
    );
    expect(result).toEqual({
      symbol: "MRCY",
      changed: true,
      version: { id: "v-4", number: 4, change_reason: "earnings" },
    });
  });

  it("returns unchanged when the assembled snapshot matches", async () => {
    const result = await saveDossierVersioned(
      mockSaveClient({
        live,
        rpc: () => ({
          data: {
            changed: false,
            dossier_id: "d-1",
            version_id: "v-3",
            version_number: 3,
          },
          error: null,
        }),
      }),
      {
        symbol: "MRCY",
        change_reason: "noop",
        changes: { summary: "Old" },
      },
    );
    expect(result.changed).toBe(false);
    expect(result.version.number).toBe(3);
  });

  it("maps version conflicts to HTTP 409 without calling a second write", async () => {
    try {
      await saveDossierVersioned(
        mockSaveClient({
          live,
          rpc: () => ({
            data: null,
            error: {
              message: "DOSSIER_VERSION_CONFLICT",
              details: "5",
            },
          }),
        }),
        {
          symbol: "MRCY",
          expected_version: 4,
          change_reason: "stale",
          changes: { summary: "New" },
        },
      );
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentApiError);
      expect(error).toMatchObject({
        status: 409,
        code: "DOSSIER_VERSION_CONFLICT",
        details: { current_version: 5 },
      });
    }
  });
});
