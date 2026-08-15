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

export type FactorKey =
  | "ai_capex"
  | "defence"
  | "nuclear"
  | "robotics"
  | "grid"
  | "other";

export type FactorWeights = Partial<Record<FactorKey, number>>;

function factors(weights: FactorWeights): FactorWeights {
  const sum = (Object.values(weights) as number[]).reduce(
    (total, value) => total + value,
    0,
  );
  if (Math.abs(sum - 1) > 0.001) {
    throw new Error(`Factor weights must sum to 1, got ${sum}`);
  }
  return weights;
}

/**
 * Explicit factor loadings vs the hyperscaler-capex complex.
 * Unknown symbols are unclassified — they do not count as AI-capex
 * and they do not count as diversifiers.
 */
export const FACTOR_EXPOSURES: Readonly<Record<string, FactorWeights>> = {
  NVDA: factors({ ai_capex: 1 }),
  AVGO: factors({ ai_capex: 1 }),
  TSM: factors({ ai_capex: 1 }),
  AMD: factors({ ai_capex: 1 }),
  ANET: factors({ ai_capex: 1 }),
  VRT: factors({ ai_capex: 1 }),
  EQIX: factors({ ai_capex: 1 }),
  SMCI: factors({ ai_capex: 1 }),
  CLS: factors({ ai_capex: 1 }),
  NBIS: factors({ ai_capex: 1 }),
  CRDO: factors({ ai_capex: 1 }),
  ALAB: factors({ ai_capex: 1 }),
  IREN: factors({ ai_capex: 1 }),
  CRWV: factors({ ai_capex: 1 }),
  MRVL: factors({ ai_capex: 1 }),
  NVT: factors({ ai_capex: 1 }),
  MU: factors({ ai_capex: 1 }),
  SKHY: factors({ ai_capex: 1 }),
  SNDK: factors({ ai_capex: 1 }),
  LITE: factors({ ai_capex: 1 }),
  COHR: factors({ ai_capex: 1 }),

  CEG: factors({ nuclear: 0.6, ai_capex: 0.4 }),
  VST: factors({ grid: 0.6, ai_capex: 0.4 }),
  GEV: factors({ grid: 0.7, ai_capex: 0.3 }),
  CCJ: factors({ nuclear: 1 }),
  ETN: factors({ ai_capex: 0.7, grid: 0.3 }),
  PWR: factors({ grid: 0.7, ai_capex: 0.3 }),
  HUBB: factors({ grid: 0.5, ai_capex: 0.5 }),
  EME: factors({ grid: 0.8, ai_capex: 0.2 }),
  BWXT: factors({ nuclear: 1 }),
  POWL: factors({ grid: 0.6, ai_capex: 0.4 }),

  ISRG: factors({ robotics: 1 }),
  TER: factors({ robotics: 0.5, ai_capex: 0.5 }),
  ROK: factors({ robotics: 0.8, ai_capex: 0.2 }),
  PATH: factors({ robotics: 0.7, other: 0.3 }),
  NOVT: factors({ robotics: 0.8, ai_capex: 0.2 }),
  AMBA: factors({ ai_capex: 0.6, robotics: 0.4 }),
  OUST: factors({ robotics: 0.7, ai_capex: 0.3 }),

  LMT: factors({ defence: 1 }),
  RTX: factors({ defence: 1 }),
  NOC: factors({ defence: 1 }),
  GD: factors({ defence: 1 }),
  AVAV: factors({ defence: 0.8, ai_capex: 0.2 }),
  KTOS: factors({ defence: 0.8, ai_capex: 0.2 }),
  MRCY: factors({ defence: 0.7, ai_capex: 0.3 }),
  TDY: factors({ defence: 0.7, robotics: 0.2, ai_capex: 0.1 }),
};

export function factorExposures(symbol: string): FactorWeights | null {
  return FACTOR_EXPOSURES[symbol.trim().toUpperCase()] ?? null;
}

/** `null` means the name has not been classified. */
export function aiCapexWeight(symbol: string): number | null {
  const mapped = factorExposures(symbol);
  if (mapped == null) return null;
  return mapped.ai_capex ?? 0;
}

export function isFactorClassified(symbol: string): boolean {
  return factorExposures(symbol) != null;
}

/** True only when a mapped name has a positive AI-capex weight. */
export function isAiCapexSymbol(symbol: string): boolean {
  return (aiCapexWeight(symbol) ?? 0) > 0;
}

export function unclassifiedSymbols(symbols: readonly string[]): string[] {
  const seen = new Set<string>();
  const unknown: string[] = [];
  for (const symbol of symbols) {
    const key = symbol.trim().toUpperCase();
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    if (!isFactorClassified(key)) unknown.push(key);
  }
  return unknown;
}
