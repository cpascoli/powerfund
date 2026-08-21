import { describe, expect, it } from "vitest";

import { AgentApiError } from "@/lib/api/agent/errors";

import { addWatchlistCompany, assertNotLedgerMutation } from "./mutate";

const THEMES = [
  { id: "theme-defence", slug: "defence", name: "Defence" },
  { id: "theme-energy", slug: "energy", name: "Energy" },
];

type InstrumentRow = {
  id: string;
  symbol: string;
  name: string;
  asset_class: string;
  exchange: string | null;
  status: string;
  is_benchmark: boolean;
  notes: string | null;
};

function createDb(existing: InstrumentRow[] = []) {
  const instruments = [...existing];
  const themeLinks: Array<{
    instrument_id: string;
    theme_id: string;
    is_primary: boolean;
  }> = [];

  return {
    instruments,
    themeLinks,
    supabase: {
      from(table: string) {
        if (table === "themes") {
          return {
            select: async () => ({ data: THEMES, error: null }),
          };
        }
        if (table === "instruments") {
          return {
            select() {
              return {
                eq(_column: string, value: string) {
                  return {
                    async maybeSingle() {
                      const row =
                        instruments.find((item) => item.symbol === value) ??
                        null;
                      return { data: row, error: null };
                    },
                  };
                },
              };
            },
            insert(values: Record<string, unknown>) {
              return {
                select() {
                  return {
                    async single() {
                      const row: InstrumentRow = {
                        id: "inst-1",
                        symbol: String(values.symbol),
                        name: String(values.name),
                        asset_class: String(values.asset_class),
                        exchange:
                          typeof values.exchange === "string"
                            ? values.exchange
                            : null,
                        status: String(values.status),
                        is_benchmark: Boolean(values.is_benchmark),
                        notes:
                          typeof values.notes === "string" ? values.notes : null,
                      };
                      instruments.push(row);
                      return { data: row, error: null };
                    },
                  };
                },
              };
            },
          };
        }
        if (table === "instrument_themes") {
          return {
            async insert(values: Record<string, unknown>) {
              themeLinks.push({
                instrument_id: String(values.instrument_id),
                theme_id: String(values.theme_id),
                is_primary: Boolean(values.is_primary),
              });
              return { error: null };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    },
  };
}

describe("addWatchlistCompany", () => {
  it("rejects ledger fields so agents cannot book fills", () => {
    try {
      assertNotLedgerMutation({
        symbol: "HII",
        name: "Huntington Ingalls",
        theme: "defence",
        quantity: 10,
        is_benchmark: true,
      });
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentApiError);
      expect((error as AgentApiError).status).toBe(422);
      expect((error as AgentApiError).details.rejected_fields).toEqual(
        expect.arrayContaining(["quantity", "is_benchmark"]),
      );
    }
  });

  it("adds a watchlist equity with a primary theme", async () => {
    const db = createDb();
    const created = await addWatchlistCompany(db.supabase as never, {
      symbol: "hii",
      name: "Huntington Ingalls",
      theme: "Defence",
      notes: "Shipbuilding / navy",
      actor_name: "chatgpt",
    });
    expect(created).toEqual({
      symbol: "HII",
      name: "Huntington Ingalls",
      status: "watchlist",
      asset_class: "equity",
      exchange: "US",
      notes: "[agent:chatgpt]\nShipbuilding / navy",
      theme: { slug: "defence", name: "Defence" },
      has_dossier: false,
    });
    expect(db.instruments[0]).toMatchObject({
      status: "watchlist",
      is_benchmark: false,
      asset_class: "equity",
    });
    expect(db.themeLinks).toEqual([
      {
        instrument_id: "inst-1",
        theme_id: "theme-defence",
        is_primary: true,
      },
    ]);
  });

  it("rejects unknown themes", async () => {
    const db = createDb();
    try {
      await addWatchlistCompany(db.supabase as never, {
        symbol: "HII",
        name: "Huntington Ingalls",
        theme: "shipbuilding",
      });
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentApiError);
      expect((error as AgentApiError).code).toBe("UNKNOWN_THEME");
    }
    expect(db.instruments).toEqual([]);
  });

  it("rejects symbols already in the universe", async () => {
    const db = createDb([
      {
        id: "existing",
        symbol: "NVDA",
        name: "NVIDIA",
        asset_class: "equity",
        exchange: "US",
        status: "watchlist",
        is_benchmark: false,
        notes: null,
      },
    ]);
    try {
      await addWatchlistCompany(db.supabase as never, {
        symbol: "NVDA",
        name: "NVIDIA",
        theme: "ai-infrastructure",
      });
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentApiError);
      expect((error as AgentApiError).status).toBe(409);
      expect((error as AgentApiError).code).toBe("SYMBOL_EXISTS");
    }
  });
});
