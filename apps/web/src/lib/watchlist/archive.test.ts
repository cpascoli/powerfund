import { describe, expect, it } from "vitest";

import { AgentApiError } from "@/lib/api/agent/errors";
import type { DbClient } from "@/lib/supabase/db";
import { setWatchlistArchived } from "./mutate";

/**
 * `archived` is the only instrument status anyone sets by hand. `active` and
 * `watchlist` follow the book through a trigger on `positions`, so writing
 * either here would overwrite a derived value with a guess.
 */
function db(args: {
  instrument?: {
    id: string;
    symbol: string;
    status: string;
    is_benchmark: boolean;
  } | null;
  openPosition?: boolean;
  updates?: Record<string, unknown>[];
}): DbClient {
  return {
    from(table: string) {
      return {
        select: () => ({
          eq: () => {
            const terminal = {
              maybeSingle: async () =>
                table === "instruments"
                  ? { data: args.instrument ?? null, error: null }
                  : {
                      data: args.openPosition ? { id: "pos-1" } : null,
                      error: null,
                    },
            };
            return { ...terminal, eq: () => ({ limit: () => terminal }) };
          },
        }),
        update: (values: Record<string, unknown>) => ({
          eq: async () => {
            args.updates?.push(values);
            return { error: null };
          },
        }),
      };
    },
  } as unknown as DbClient;
}

const watched = {
  id: "i-1",
  symbol: "SNDK",
  status: "watchlist",
  is_benchmark: false,
};

describe("setWatchlistArchived", () => {
  it("archives a name that is not held", async () => {
    const updates: Record<string, unknown>[] = [];
    const result = await setWatchlistArchived(
      db({ instrument: watched, updates }),
      { symbol: "sndk", archived: true },
    );
    expect(result).toEqual({ symbol: "SNDK", status: "archived", changed: true });
    expect(updates).toEqual([{ status: "archived" }]);
  });

  /**
   * Archiving a held name is almost always a mis-typed symbol, and letting it
   * through hides a live position from every view that filters archived rows
   * out while the book still carries it.
   */
  it("refuses to archive a name that is still held", async () => {
    const updates: Record<string, unknown>[] = [];
    await expect(
      setWatchlistArchived(
        db({ instrument: { ...watched, status: "active" }, openPosition: true, updates }),
        { symbol: "SNDK", archived: true },
      ),
    ).rejects.toBeInstanceOf(AgentApiError);
    expect(updates).toEqual([]);
  });

  it("restores an archived name without needing the position check", async () => {
    const updates: Record<string, unknown>[] = [];
    const result = await setWatchlistArchived(
      db({ instrument: { ...watched, status: "archived" }, openPosition: true, updates }),
      { symbol: "SNDK", archived: false },
    );
    expect(result.status).toBe("watchlist");
    expect(updates).toEqual([{ status: "watchlist" }]);
  });

  it("is a no-op when the name is already in that state", async () => {
    const updates: Record<string, unknown>[] = [];
    const result = await setWatchlistArchived(
      db({ instrument: { ...watched, status: "archived" }, updates }),
      { symbol: "SNDK", archived: true },
    );
    expect(result.changed).toBe(false);
    expect(updates).toEqual([]);
  });

  it("refuses to archive a benchmark, whose bars are the trading calendar", async () => {
    await expect(
      setWatchlistArchived(
        db({ instrument: { ...watched, symbol: "SPY", is_benchmark: true } }),
        { symbol: "SPY", archived: true },
      ),
    ).rejects.toBeInstanceOf(AgentApiError);
  });

  it("404s on an unknown symbol", async () => {
    await expect(
      setWatchlistArchived(db({ instrument: null }), {
        symbol: "NOPE",
        archived: true,
      }),
    ).rejects.toBeInstanceOf(AgentApiError);
  });
});
