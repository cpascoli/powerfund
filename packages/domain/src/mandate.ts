import { BOOK_CURRENCY, toCents } from "./money";
import {
  aiCapexWeight,
  aiMemoryWeight,
  RISK_DEFAULTS,
  unclassifiedSymbols,
} from "./risk";

export type MandateViolationCode =
  | "position_cap"
  | "theme_cap"
  | "cash_floor"
  | "phase1_invested"
  | "drawdown_kill_switch"
  | "ai_capex_factor"
  | "ai_memory_sleeve"
  | "factor_unclassified";

export type MandateViolation = {
  code: MandateViolationCode;
  label: string;
};

export type MandatePosition = {
  symbol: string;
  themeSlug: string;
  marketValue: number;
  costBasis: number;
};

export type MandateBook = {
  nav: number;
  cash: number;
  invested: number;
  killSwitchBreached: boolean;
  positions: MandatePosition[];
};

export type ProposedBuy = {
  symbol: string;
  themeSlug: string;
  /** Cash leaving the book (quantity × price + fees). */
  costUsd: number;
};

/**
 * Mandate rule 8: −15% deployed sleeve is always a diagnostic.
 * New buys are blocked on that flag only after invested cost exceeds the
 * Phase-1 cap. Per-name invalidation is a separate rule.
 */
export function shouldHaltNewRiskForKillSwitch(
  killSwitchBreached: boolean,
  investedCostUsd: number,
): boolean {
  return (
    killSwitchBreached && investedCostUsd > RISK_DEFAULTS.phase1InvestedCapUsd
  );
}

function pct(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

function money(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/**
 * Project the book after a buy marked at cost (NAV unchanged: cash down,
 * position up by the same dollars). That is the honest fill-at-market case
 * and the conservative case for a premium fill.
 */
export function projectBookAfterBuy(
  book: MandateBook,
  buy: ProposedBuy,
): MandateBook {
  const cost = toCents(buy.costUsd);
  const symbol = buy.symbol.toUpperCase();
  let found = false;
  const positions = book.positions.map((row) => {
    if (row.symbol.toUpperCase() !== symbol) return row;
    found = true;
    return {
      ...row,
      marketValue: row.marketValue + cost,
      costBasis: row.costBasis + cost,
    };
  });
  if (!found) {
    positions.push({
      symbol,
      themeSlug: buy.themeSlug,
      marketValue: cost,
      costBasis: cost,
    });
  }
  return {
    nav: book.nav,
    cash: book.cash - cost,
    invested: book.invested + cost,
    killSwitchBreached: book.killSwitchBreached,
    positions,
  };
}

function weightedNavPct(
  positions: MandatePosition[],
  nav: number,
  weightOf: (symbol: string) => number | null,
): number | null {
  if (nav <= 0) return null;
  const value = positions.reduce((sum, row) => {
    const weight = weightOf(row.symbol);
    if (weight == null) return sum;
    return sum + row.marketValue * weight;
  }, 0);
  return pct(value, nav);
}

export function aiCapexNavPct(
  positions: MandatePosition[],
  nav: number,
): number | null {
  return weightedNavPct(positions, nav, aiCapexWeight);
}

export function aiMemoryNavPct(
  positions: MandatePosition[],
  nav: number,
): number | null {
  return weightedNavPct(positions, nav, aiMemoryWeight);
}

export function evaluateMandate(book: MandateBook): MandateViolation[] {
  const violations: MandateViolation[] = [];
  const nav = book.nav;

  for (const row of book.positions) {
    const weight = pct(row.marketValue, nav);
    if (weight > RISK_DEFAULTS.maxPositionPctNav) {
      violations.push({
        code: "position_cap",
        label: `${row.symbol} would be ${weight.toFixed(1)}% of NAV (cap ${RISK_DEFAULTS.maxPositionPctNav}%)`,
      });
    }
  }

  const byTheme = new Map<string, number>();
  for (const row of book.positions) {
    byTheme.set(row.themeSlug, (byTheme.get(row.themeSlug) ?? 0) + row.marketValue);
  }
  for (const [slug, value] of byTheme) {
    const weight = pct(value, nav);
    if (weight > RISK_DEFAULTS.maxThemePctNav) {
      violations.push({
        code: "theme_cap",
        label: `Theme ${slug} would be ${weight.toFixed(1)}% of NAV (cap ${RISK_DEFAULTS.maxThemePctNav}%)`,
      });
    }
  }

  const cashPct = pct(book.cash, nav);
  if (cashPct < RISK_DEFAULTS.minCashPctNav) {
    violations.push({
      code: "cash_floor",
      label: `Cash would be ${cashPct.toFixed(1)}% of NAV (floor ${RISK_DEFAULTS.minCashPctNav}%)`,
    });
  }

  if (book.invested > RISK_DEFAULTS.phase1InvestedCapUsd) {
    violations.push({
      code: "phase1_invested",
      label: `Invested cost would be ${money(book.invested)} vs the ${money(RISK_DEFAULTS.phase1InvestedCapUsd)} phase-1 cap`,
    });
  }

  if (
    shouldHaltNewRiskForKillSwitch(book.killSwitchBreached, book.invested)
  ) {
    violations.push({
      code: "drawdown_kill_switch",
      label:
        "Deployed-sleeve drawdown diagnostic is on after Phase 1 — halt new risk until the book is reviewed",
    });
  }

  const factorPct = aiCapexNavPct(book.positions, nav);
  if (
    factorPct != null &&
    factorPct > RISK_DEFAULTS.maxAiCapexFactorPctNav
  ) {
    violations.push({
      code: "ai_capex_factor",
      label: `AI-capex complex would be ${factorPct.toFixed(1)}% of NAV (cap ${RISK_DEFAULTS.maxAiCapexFactorPctNav}%)`,
    });
  }

  const memoryPct = aiMemoryNavPct(book.positions, nav);
  if (
    memoryPct != null &&
    memoryPct > RISK_DEFAULTS.maxAiMemorySleevePctNav
  ) {
    violations.push({
      code: "ai_memory_sleeve",
      label: `AI memory/storage sleeve would be ${memoryPct.toFixed(1)}% of NAV (guide ${RISK_DEFAULTS.maxAiMemorySleevePctNav}%)`,
    });
  }

  const unknown = unclassifiedSymbols(book.positions.map((row) => row.symbol));
  if (unknown.length > 0) {
    violations.push({
      code: "factor_unclassified",
      label: `${unknown.join(", ")} ${unknown.length === 1 ? "has" : "have"} no factor map — classify before treating ${unknown.length === 1 ? "it" : "them"} as AI-capex or a diversifier`,
    });
  }

  return violations;
}

/**
 * Hard stop before any mandate cap is considered: the book has no FX layer.
 *
 * Bars, market caps and fundamentals are all stored in the listing's own
 * currency, while cash, NAV, cost basis and every cap are USD. Booking a foreign
 * listing would mark the position at its local price as if it were dollars — SK
 * Hynix at a ₩1,623,000 close would enter the book at $1.6m a share and blow
 * through every cap while looking arithmetically fine.
 *
 * Returns the reason a buy must be refused, or `null` when the listing is
 * bookable. Unlike a cap breach this is not overridable: no written reason makes
 * the arithmetic true.
 */
export function bookCurrencyBlock(
  symbol: string,
  currency: string | null | undefined,
): string | null {
  const listed = (currency ?? BOOK_CURRENCY).trim().toUpperCase();
  if (listed === BOOK_CURRENCY) return null;
  return (
    `${symbol} is listed in ${listed} and the book has no FX conversion. ` +
    `Its marks, weights and NAV contribution would all be wrong. ` +
    `Book a ${BOOK_CURRENCY} listing or ADR instead.`
  );
}

export function evaluateProposedBuy(
  book: MandateBook,
  buy: ProposedBuy,
): MandateViolation[] {
  if (buy.costUsd <= 0) return [];
  return evaluateMandate(projectBookAfterBuy(book, buy));
}

export function formatMandateBlock(violations: MandateViolation[]): string {
  const lines = violations.map((row) => `- ${row.label}`);
  return [
    "This would breach mandate rules:",
    ...lines,
    "Write a mandate override reason to proceed.",
  ].join("\n");
}
