import { describe, expect, it } from "vitest";

import { AgentApiError } from "@/lib/api/agent/errors";
import type { DbClient } from "@/lib/supabase/db";

import { reviewTaskIdsFor } from "./records";

/**
 * The invariant the review-history work rests on, and the one that was only ever
 * checked by hand against production: `symbol=CRDO` must return a macro review
 * that merely listed CRDO among eight tickers, because that review carries a
 * prior belief about the name.
 *
 * The complement matters just as much. `scope: portfolio` tasks carry no symbol
 * links by design, so no symbol query can ever reach the monthly pass or the
 * opportunity ranking — which is why the operating process tells the agent to
 * fetch the book-level chain separately.
 */

const INSTRUMENTS = [
  { id: "i-crdo", symbol: "CRDO" },
  { id: "i-avgo", symbol: "AVGO" },
];

const THEMES = [
  { id: "t-ai", slug: "ai-infrastructure", name: "AI Infrastructure" },
  { id: "t-energy", slug: "energy", name: "Energy" },
];

// Two catalyst reviews touching CRDO — one company-scoped, one macro review that
// listed it alongside others — plus a portfolio review with no links at all.
const INSTRUMENT_LINKS = [
  { review_task_id: "r-crdo-earnings", instrument_id: "i-crdo" },
  { review_task_id: "r-jackson-hole", instrument_id: "i-crdo" },
  { review_task_id: "r-jackson-hole", instrument_id: "i-avgo" },
  { review_task_id: "r-avgo-print", instrument_id: "i-avgo" },
];

const THEME_LINKS = [
  { review_task_id: "r-crdo-earnings", theme_id: "t-ai" },
  { review_task_id: "r-theme-optical", theme_id: "t-ai" },
];

function fakeDb(): DbClient {
  const client = {
    from(table: string) {
      const rowsFor = (column: string, values: string[]) => {
        if (table === "instruments") {
          return INSTRUMENTS.filter((row) => values.includes(row.symbol));
        }
        if (table === "themes") return THEMES;
        if (table === "review_task_instruments") {
          return INSTRUMENT_LINKS.filter((row) =>
            values.includes(row.instrument_id),
          ).map((row) => ({ review_task_id: row.review_task_id }));
        }
        if (table === "review_task_themes") {
          return THEME_LINKS.filter((row) => values.includes(row.theme_id)).map(
            (row) => ({ review_task_id: row.review_task_id }),
          );
        }
        throw new Error(`unexpected table ${table}`);
      };
      return {
        select() {
          const builder = {
            in(column: string, values: string[]) {
              return Promise.resolve({
                data: rowsFor(column, values),
                error: null,
              });
            },
            // `themes` is fetched whole, then matched in memory.
            then(resolve: (value: unknown) => unknown) {
              return Promise.resolve({
                data: rowsFor("", []),
                error: null,
              }).then(resolve);
            },
          };
          return builder;
        },
      };
    },
  };
  return client as unknown as DbClient;
}

describe("reviewTaskIdsFor", () => {
  it("returns a macro review that merely listed the symbol", async () => {
    const ids = await reviewTaskIdsFor(fakeDb(), {
      symbols: ["CRDO"],
      themes: [],
    });
    expect(ids).toEqual(
      expect.arrayContaining(["r-crdo-earnings", "r-jackson-hole"]),
    );
    // The AVGO-only print is not about CRDO.
    expect(ids).not.toContain("r-avgo-print");
  });

  it("never reaches a portfolio review, which carries no symbol links", async () => {
    const ids = await reviewTaskIdsFor(fakeDb(), {
      symbols: ["CRDO", "AVGO"],
      themes: ["ai-infrastructure"],
    });
    // The monthly pass and the opportunity ranking are unreachable this way by
    // design; the process fetches them with scope=portfolio instead.
    expect(ids).not.toContain("r-monthly-pass");
  });

  it("unions symbol and theme rather than intersecting them", async () => {
    const ids = await reviewTaskIdsFor(fakeDb(), {
      symbols: ["CRDO"],
      themes: ["ai-infrastructure"],
    });
    // r-theme-optical has the theme and not the symbol; it is still returned.
    expect(ids).toEqual(
      expect.arrayContaining([
        "r-crdo-earnings",
        "r-jackson-hole",
        "r-theme-optical",
      ]),
    );
  });

  it("dedupes a task linked by both symbol and theme", async () => {
    const ids = await reviewTaskIdsFor(fakeDb(), {
      symbols: ["CRDO"],
      themes: ["ai-infrastructure"],
    });
    expect(ids?.filter((id) => id === "r-crdo-earnings")).toHaveLength(1);
  });

  it("returns null when nothing was asked for, so no filter is applied", async () => {
    // null is distinct from []: an empty array would filter everything out.
    expect(await reviewTaskIdsFor(fakeDb(), { symbols: [], themes: [] })).toBeNull();
  });

  it("rejects an unknown symbol rather than silently matching nothing", async () => {
    await expect(
      reviewTaskIdsFor(fakeDb(), { symbols: ["NOPE"], themes: [] }),
    ).rejects.toBeInstanceOf(AgentApiError);
  });

  it("accepts a theme by name as well as slug", async () => {
    const ids = await reviewTaskIdsFor(fakeDb(), {
      symbols: [],
      themes: ["AI Infrastructure"],
    });
    expect(ids).toEqual(
      expect.arrayContaining(["r-crdo-earnings", "r-theme-optical"]),
    );
  });
});
