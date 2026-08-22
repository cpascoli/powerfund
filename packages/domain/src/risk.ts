/** Defaults from docs/mandate.md — tune after first live month. */
export const RISK_DEFAULTS = {
  maxPositionPctNav: 10,
  maxThemePctNav: 40,
  minCashPctNav: 10,
  /** 15% unitized deployed-sleeve drawdown. Diagnostic always; buy-halt only after Phase 1. */
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
 * Mandate allocation sleeves. Unit-sum. This is not a stress-beta model:
 * `ai_memory` counts fully toward the 40% AI-capex cap and separately
 * toward the 15% memory sleeve.
 */
export type FactorKey =
  | "ai_capex"
  | "ai_memory"
  | "defence"
  | "nuclear"
  | "robotics"
  | "grid"
  | "other";

export const FACTOR_KEYS: readonly FactorKey[] = [
  "ai_capex",
  "ai_memory",
  "defence",
  "nuclear",
  "robotics",
  "grid",
  "other",
];

export type FactorWeights = Partial<Record<FactorKey, number>>;

export type FactorExposureRecord = {
  weights: FactorWeights;
  rationale: string;
  reviewedAt: string;
};

const REVIEWED_AT = "2026-08-16";

function entry(
  weights: FactorWeights,
  rationale: string,
): FactorExposureRecord {
  let sum = 0;
  for (const value of Object.values(weights) as number[]) {
    if (value < 0 || value > 1) {
      throw new Error(`Factor weight ${value} is outside 0–1`);
    }
    sum += value;
  }
  if (Math.abs(sum - 1) > 0.001) {
    throw new Error(`Factor weights must sum to 1, got ${sum}`);
  }
  return { weights, rationale, reviewedAt: REVIEWED_AT };
}

/**
 * Explicit mandate loadings vs the hyperscaler-capex complex.
 * Unknown symbols are unclassified — they do not count as AI-capex
 * and they do not count as diversifiers.
 */
export const FACTOR_EXPOSURES: Readonly<Record<string, FactorExposureRecord>> = {
  NVDA: entry({ ai_capex: 1 }, "Accelerators are the core hyperscaler spend."),
  AVGO: entry(
    { ai_capex: 0.65, other: 0.35 },
    "Custom silicon and networking sit next to a large infrastructure-software book.",
  ),
  TSM: entry(
    { ai_capex: 0.75, other: 0.25 },
    "Leading-edge foundry is AI-sensitive; mobile, auto, and other compute remain.",
  ),
  AMD: entry({ ai_capex: 1 }, "GPU/CPU exposure is the AI-compute cycle."),
  ANET: entry({ ai_capex: 1 }, "Data-center networking is hyperscaler capex."),
  VRT: entry({ ai_capex: 1 }, "Thermal and power for AI halls."),
  EQIX: entry(
    { ai_capex: 0.65, other: 0.35 },
    "AI helps colo, but enterprise interconnection is broader than training clusters.",
  ),
  SMCI: entry({ ai_capex: 1 }, "AI server systems."),
  CLS: entry(
    { ai_capex: 0.85, other: 0.15 },
    "AI server and networking EMS is dominant, not exclusive.",
  ),
  NBIS: entry({ ai_capex: 1 }, "Specialized AI cloud."),
  CRDO: entry({ ai_capex: 1 }, "High-speed AI rack connectivity."),
  ALAB: entry({ ai_capex: 1 }, "AI rack-scale connectivity."),
  IREN: entry(
    { ai_capex: 0.6, other: 0.4 },
    "AI cloud buildout sits beside crypto/power; those are not the same factor.",
  ),
  CRWV: entry({ ai_capex: 1 }, "GPU neocloud."),
  MRVL: entry(
    { ai_capex: 0.75, other: 0.25 },
    "Custom AI silicon and optical, plus carrier/storage networking.",
  ),
  NVT: entry(
    { ai_capex: 0.5, grid: 0.3, other: 0.2 },
    "Liquid cooling and rack power matter; electrical and industrial exposure is broader.",
  ),
  MU: entry(
    { ai_memory: 1 },
    "HBM/DRAM. Counts fully toward the memory sleeve and the AI-capex cap.",
  ),
  SKHY: entry(
    { ai_memory: 1 },
    "HBM/DRAM. Counts fully toward the memory sleeve and the AI-capex cap.",
  ),
  SNDK: entry(
    { ai_memory: 1 },
    "NAND/storage. Counts fully toward the memory sleeve and the AI-capex cap.",
  ),
  LITE: entry(
    { ai_capex: 0.7, other: 0.3 },
    "Optical AI interconnect plus telecom and industrial photonics.",
  ),
  COHR: entry(
    { ai_capex: 0.6, other: 0.4 },
    "AI photonics inside a broader industrial and communications book.",
  ),

  CEG: entry(
    { nuclear: 0.75, ai_capex: 0.25 },
    "Firm nuclear power; AI offtake is real but not the whole equity.",
  ),
  VST: entry(
    { ai_capex: 0.25, other: 0.75 },
    "Generator and retailer, not a grid-capex name. Large-load AI is a slice.",
  ),
  GEV: entry(
    { grid: 0.55, ai_capex: 0.2, other: 0.25 },
    "Grid equipment plus turbines, wind, and services.",
  ),
  CCJ: entry({ nuclear: 1 }, "Uranium fuel cycle. Diversifier vs hyperscaler capex."),
  ETN: entry(
    { grid: 0.5, ai_capex: 0.35, other: 0.15 },
    "Electrical and data-center power, not a pure AI-cooling name.",
  ),
  PWR: entry(
    { grid: 0.65, ai_capex: 0.25, other: 0.1 },
    "Grid services first; data-center interconnect is the AI slice.",
  ),
  HUBB: entry(
    { grid: 0.75, ai_capex: 0.15, other: 0.1 },
    "Grid-to-chip electrical; most of the book is not hyperscaler halls.",
  ),
  EME: entry(
    { ai_capex: 0.35, grid: 0.15, other: 0.5 },
    "Diversified electrical/mechanical construction; data-center work is material, not the company.",
  ),
  BWXT: entry(
    { defence: 0.65, nuclear: 0.35 },
    "Naval nuclear and government operations, not civilian AI power.",
  ),
  POWL: entry(
    { grid: 0.5, ai_capex: 0.3, other: 0.2 },
    "Switchgear for data centers plus industrial and energy distribution.",
  ),

  ISRG: entry(
    { robotics: 1 },
    "Thematic robotics; economically procedure volume and hospital adoption, not hyperscaler capex.",
  ),
  TER: entry(
    { ai_capex: 0.5, robotics: 0.2, other: 0.3 },
    "Semiconductor test is AI-cycle sensitive; automation is the rest.",
  ),
  ROK: entry(
    { robotics: 0.85, other: 0.15 },
    "Industrial automation. Benefiting from AI software is not hyperscaler capex.",
  ),
  PATH: entry(
    { robotics: 0.5, other: 0.5 },
    "Enterprise automation software, not AI-cluster spend.",
  ),
  NOVT: entry(
    { robotics: 0.35, ai_capex: 0.15, other: 0.5 },
    "Precision motion and robot tooling; only a thin AI-capex link.",
  ),
  AMBA: entry(
    { ai_capex: 0.45, robotics: 0.45, other: 0.1 },
    "Edge-AI SoCs split between vision/robotics and compute cycles.",
  ),
  OUST: entry(
    { robotics: 0.9, other: 0.1 },
    "LiDAR/perception. Not hyperscaler training capex.",
  ),

  LMT: entry({ defence: 1 }, "Appropriations-driven prime."),
  NOC: entry({ defence: 1 }, "Appropriations-driven prime."),
  RTX: entry(
    { defence: 0.55, other: 0.45 },
    "Raytheon is defence; Collins and Pratt are commercial aerospace.",
  ),
  GD: entry(
    { defence: 0.75, other: 0.25 },
    "Platforms and munitions plus a material Gulfstream book.",
  ),
  AVAV: entry(
    { defence: 1 },
    "Autonomous defence systems. DoD demand, not hyperscaler capex.",
  ),
  KTOS: entry(
    { defence: 1 },
    "Unmanned and rocket support. DoD demand, not hyperscaler capex.",
  ),
  MRCY: entry(
    { defence: 0.9, ai_capex: 0.1 },
    "Rugged DoD compute and RF. A thin overlap with AI electronics, not training clusters.",
  ),
  TDY: entry(
    { defence: 0.5, robotics: 0.15, other: 0.35 },
    "Sensing and instrumentation across defence, industrial, and imaging.",
  ),
};

export function factorRecord(symbol: string): FactorExposureRecord | null {
  return FACTOR_EXPOSURES[symbol.trim().toUpperCase()] ?? null;
}

export function factorExposures(symbol: string): FactorWeights | null {
  return factorRecord(symbol)?.weights ?? null;
}

/**
 * Mandate weight on the hyperscaler-capex complex.
 * `ai_memory` counts fully. `null` means unclassified.
 */
export function aiCapexWeight(symbol: string): number | null {
  const mapped = factorExposures(symbol);
  if (mapped == null) return null;
  return (mapped.ai_capex ?? 0) + (mapped.ai_memory ?? 0);
}

/** Mandate weight on the AI memory/storage sleeve. `null` if unclassified. */
export function aiMemoryWeight(symbol: string): number | null {
  const mapped = factorExposures(symbol);
  if (mapped == null) return null;
  return mapped.ai_memory ?? 0;
}

export function isFactorClassified(symbol: string): boolean {
  return factorRecord(symbol) != null;
}

/** True only when a mapped name has a positive AI-capex or memory weight. */
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
