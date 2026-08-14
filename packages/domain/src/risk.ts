/** Defaults from docs/mandate.md — tune after first live month. */
export const RISK_DEFAULTS = {
  maxPositionPctNav: 10,
  maxThemePctNav: 40,
  minCashPctNav: 10,
  drawdownKillSwitchPct: 15,
  /** Soft guide: pure AI memory/storage names inside the AI infra theme. */
  maxAiMemorySleevePctNav: 15,
  /** Soft cap on invested cost during phase-1 deployment. */
  phase1InvestedCapUsd: 75000,
  /**
   * Combined AI-capex complex as a share of NAV (cash included).
   * Mandate rule 10 — theme labels are not diversification; aligned with
   * the theme cap so one factor cannot exceed a single theme.
   */
  maxAiCapexFactorPctNav: 40,
} as const;

export type RiskDefaults = typeof RISK_DEFAULTS;

/**
 * Names the mandate treats as genuine diversifiers vs the AI-capex complex
 * (uranium fuel cycle, appropriations-driven defence primes, backlog
 * construction). Everything else in the book counts toward the factor cap.
 */
export const FACTOR_DIVERSIFIER_SYMBOLS = [
  "CCJ",
  "EME",
  "LMT",
  "NOC",
  "GD",
  "RTX",
] as const;

export function isAiCapexSymbol(symbol: string): boolean {
  return !(FACTOR_DIVERSIFIER_SYMBOLS as readonly string[]).includes(
    symbol.toUpperCase(),
  );
}
