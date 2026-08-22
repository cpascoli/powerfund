import { describe, expect, it } from "vitest";
import {
  evaluateProposedBuy,
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
