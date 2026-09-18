import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The 18 September review's second P0: `mandateGate` ran `evaluateProposedBuy`
 * for every planned action, so a queued `sell` was measured against the caps and
 * the kill-switch halt. Above the Phase-1 invested cap that means the one
 * automated risk control able to block anything would have blocked the exit the
 * drawdown diagnostic had just recommended.
 *
 * These tests assert both directions. A sell that is waved through is only
 * correct if the same book still stops a buy — a gate that passes everything
 * would satisfy the first assertion on its own.
 */

/** Every read the gate performs, so the sell path can be shown not to take them. */
const reads: string[] = [];

/** Breaching, and past the Phase-1 cap, so the halt is live rather than inert. */
const BOOK = {
  nav: 250_000,
  cash: 100_000,
  invested: 150_000,
  killSwitchBreached: true,
  positions: [
    {
      symbol: "VRT",
      themeSlug: "ai-infrastructure",
      marketValue: 40_000,
      costBasis: 45_000,
    },
  ],
};

let openPositionInstrumentIds = new Set<string>(["instr-vrt"]);

vi.mock("@/lib/data/portfolio", () => ({
  getOpenPortfolioBook: async () => {
    reads.push("portfolio");
    return {
      nav: BOOK.nav,
      cash: BOOK.cash,
      invested: BOOK.invested,
      marketValue: 40_000,
      positions: BOOK.positions.map((row) => ({ ...row })),
    };
  },
}));

vi.mock("@/lib/data/research", () => ({
  listInstrumentsWithThemes: async () => {
    reads.push("research");
    return [
      { id: "instr-vrt", symbol: "VRT", theme_slug: "ai-infrastructure", currency: "USD" },
    ];
  },
}));

vi.mock("@/lib/data/snapshots", () => ({
  listPortfolioSnapshots: async () => {
    reads.push("snapshots");
    return [];
  },
  listLedgerFlows: async () => {
    reads.push("flows");
    return [];
  },
  computeDrawdown: () => {
    reads.push("drawdown");
    return { killSwitchBreached: BOOK.killSwitchBreached };
  },
}));

vi.mock("@/lib/supabase/db", () => ({
  resolveDb: async () => ({
    from(table: string) {
      reads.push(`db:${table}`);
      return {
        select: () => ({
          eq: (_col: string, instrumentId: string) => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: async () =>
                  openPositionInstrumentIds.has(instrumentId)
                    ? { data: { id: "pos-1" }, error: null }
                    : { data: null, error: null },
              }),
            }),
          }),
        }),
      };
    },
  }),
}));

const { mandateGate } = await import("./enforce");

beforeEach(() => {
  reads.length = 0;
  openPositionInstrumentIds = new Set<string>(["instr-vrt"]);
});

describe("mandateGate", () => {
  it("blocks a buy on a breached book above the Phase-1 cap", async () => {
    const gate = await mandateGate({
      instrumentId: "instr-vrt",
      costUsd: 5_000,
      overrideReason: null,
      side: "buy",
    });

    expect(gate.ok).toBe(false);
    expect(gate.violations.map((row) => row.code)).toContain(
      "drawdown_kill_switch",
    );
  });

  it("allows a sell on that same book, because the halt is a limit on new risk", async () => {
    const gate = await mandateGate({
      instrumentId: "instr-vrt",
      costUsd: 5_000,
      overrideReason: null,
      side: "sell",
    });

    expect(gate.ok).toBe(true);
    expect(gate.violations).toEqual([]);
  });

  it("does not read the drawdown state at all when the side is a sell", async () => {
    await mandateGate({
      instrumentId: "instr-vrt",
      costUsd: 5_000,
      overrideReason: null,
      side: "sell",
    });

    // Not merely "the halt did not fire": the sale never consults the series the
    // halt is computed from, so no future change to the drawdown maths can reach
    // the exit path.
    expect(reads).not.toContain("snapshots");
    expect(reads).not.toContain("drawdown");
    expect(reads).not.toContain("portfolio");
    expect(reads).toContain("db:positions");
  });

  it("refuses a sell in an instrument with no open position", async () => {
    openPositionInstrumentIds = new Set<string>();

    const gate = await mandateGate({
      instrumentId: "instr-vrt",
      costUsd: 5_000,
      overrideReason: null,
      side: "sell",
    });

    expect(gate.ok).toBe(false);
    expect(gate.ok ? "" : gate.error).toMatch(/nothing to sell/i);
  });

  it("does not let an override reason conjure a position", async () => {
    openPositionInstrumentIds = new Set<string>();

    const gate = await mandateGate({
      instrumentId: "instr-vrt",
      costUsd: 5_000,
      overrideReason: "the diagnostic says trim this today",
      side: "sell",
    });

    expect(gate.ok).toBe(false);
  });
});
