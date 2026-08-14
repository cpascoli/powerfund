import { toCents } from "./money";
import {
  isAiCapexSymbol,
  RISK_DEFAULTS,
} from "./risk";

export type MandateViolationCode =
  | "position_cap"
  | "theme_cap"
  | "cash_floor"
  | "phase1_invested"
  | "drawdown_kill_switch"
  | "ai_capex_factor";

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

export function aiCapexDeployedPct(positions: MandatePosition[]): number | null {
  const deployed = positions.reduce((sum, row) => sum + row.marketValue, 0);
  if (deployed <= 0) return null;
  const complex = positions.reduce(
    (sum, row) =>
      sum + (isAiCapexSymbol(row.symbol) ? row.marketValue : 0),
    0,
  );
  return pct(complex, deployed);
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

  if (book.killSwitchBreached) {
    violations.push({
      code: "drawdown_kill_switch",
      label: `Kill-switch is already breached — halt new risk until the book is reviewed`,
    });
  }

  const factorPct = aiCapexDeployedPct(book.positions);
  if (
    factorPct != null &&
    factorPct > RISK_DEFAULTS.maxAiCapexFactorPctDeployed
  ) {
    violations.push({
      code: "ai_capex_factor",
      label: `AI-capex complex would be ${factorPct.toFixed(1)}% of deployed capital (soft cap ${RISK_DEFAULTS.maxAiCapexFactorPctDeployed}%)`,
    });
  }

  return violations;
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
