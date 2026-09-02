import { describe, expect, it } from "vitest";
import {
  aiCapexWeight,
  aiMemoryWeight,
  bookCurrencyBlock,
  evaluateProposedBuy,
  projectBookAfterBuy,
  RISK_DEFAULTS,
  shouldHaltNewRiskForKillSwitch,
  type MandateBook,
} from "@powerfund/domain";

function seedBook(overrides: Partial<MandateBook> = {}): MandateBook {
  return {
    nav: 250_000,
    cash: 232_000,
    invested: 18_000,
    killSwitchBreached: true,
    positions: [
      {
        symbol: "VRT",
        themeSlug: "ai-infrastructure",
        marketValue: 18_000,
        costBasis: 18_000,
      },
    ],
    ...overrides,
  };
}

describe("shouldHaltNewRiskForKillSwitch", () => {
  it("does not halt during Phase 1 even when the 15% diagnostic is on", () => {
    expect(shouldHaltNewRiskForKillSwitch(true, 18_000)).toBe(false);
    expect(
      shouldHaltNewRiskForKillSwitch(true, RISK_DEFAULTS.phase1InvestedCapUsd),
    ).toBe(false);
  });

  it("halts new risk after invested cost exceeds the Phase-1 cap", () => {
    expect(
      shouldHaltNewRiskForKillSwitch(
        true,
        RISK_DEFAULTS.phase1InvestedCapUsd + 1,
      ),
    ).toBe(true);
  });

  it("never halts when the diagnostic is off", () => {
    expect(
      shouldHaltNewRiskForKillSwitch(
        false,
        RISK_DEFAULTS.phase1InvestedCapUsd + 50_000,
      ),
    ).toBe(false);
  });
});

describe("evaluateProposedBuy kill-switch gate", () => {
  it("allows a thesis-intact Phase-1 buy while the sleeve diagnostic is on", () => {
    const violations = evaluateProposedBuy(seedBook(), {
      symbol: "ISRG",
      themeSlug: "robotics-ai",
      costUsd: 4_000,
    });
    expect(violations.map((row) => row.code)).not.toContain(
      "drawdown_kill_switch",
    );
  });

  it("blocks a new buy after Phase 1 when the diagnostic is on", () => {
    const book = seedBook({
      invested: 80_000,
      cash: 170_000,
      positions: [
        {
          symbol: "VRT",
          themeSlug: "ai-infrastructure",
          marketValue: 20_000,
          costBasis: 20_000,
        },
        {
          symbol: "ISRG",
          themeSlug: "robotics-ai",
          marketValue: 20_000,
          costBasis: 20_000,
        },
        {
          symbol: "VST",
          themeSlug: "energy",
          marketValue: 20_000,
          costBasis: 20_000,
        },
        {
          symbol: "MRCY",
          themeSlug: "defence",
          marketValue: 20_000,
          costBasis: 20_000,
        },
      ],
    });
    const violations = evaluateProposedBuy(book, {
      symbol: "ISRG",
      themeSlug: "robotics-ai",
      costUsd: 4_000,
    });
    expect(violations.map((row) => row.code)).toContain("drawdown_kill_switch");
  });
});

describe("evaluateProposedBuy size and cash gates", () => {
  it("keeps NAV unchanged and flags a position that would exceed 10% NAV", () => {
    const before = seedBook({ killSwitchBreached: false });
    const after = projectBookAfterBuy(before, {
      symbol: "ISRG",
      themeSlug: "robotics-ai",
      costUsd: 30_000,
    });
    expect(after.nav).toBe(before.nav);
    expect(after.cash).toBe(before.cash - 30_000);
    expect(after.invested).toBe(before.invested + 30_000);
    const violations = evaluateProposedBuy(before, {
      symbol: "ISRG",
      themeSlug: "robotics-ai",
      costUsd: 30_000,
    });
    expect(violations.map((row) => row.code)).toContain("position_cap");
  });

  it("flags cash below the 10% floor after a large buy", () => {
    const book = seedBook({
      killSwitchBreached: false,
      cash: 30_000,
      nav: 250_000,
      invested: 18_000,
    });
    const violations = evaluateProposedBuy(book, {
      symbol: "ISRG",
      themeSlug: "robotics-ai",
      costUsd: 10_000,
    });
    expect(violations.map((row) => row.code)).toContain("cash_floor");
  });

  it("counts HBM names fully toward both the memory sleeve and the AI-capex cap", () => {
    expect(aiMemoryWeight("MU")).toBe(1);
    expect(aiCapexWeight("MU")).toBe(1);
    expect(aiCapexWeight("MRCY")).toBeCloseTo(0.1, 8);
    expect(aiCapexWeight("ISRG")).toBe(0);
  });
});

describe("bookCurrencyBlock", () => {
  it("allows a USD listing", () => {
    expect(bookCurrencyBlock("VRT", "USD")).toBeNull();
    expect(bookCurrencyBlock("VRT", "usd")).toBeNull();
  });

  it("treats a missing currency as the book currency", () => {
    expect(bookCurrencyBlock("VRT", null)).toBeNull();
  });

  it("refuses a foreign listing because there is no FX layer", () => {
    // SKHY closes near ₩1,623,000 — booked as dollars that is $1.6m a share.
    const block = bookCurrencyBlock("SKHY", "KRW");
    expect(block).toContain("KRW");
    expect(block).toContain("no FX conversion");
  });
});
