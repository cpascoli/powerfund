/** Defaults from docs/mandate.md — tune after first live month. */
export const RISK_DEFAULTS = {
  maxPositionPctNav: 10,
  maxThemePctNav: 40,
  minCashPctNav: 10,
  drawdownKillSwitchPct: 15,
} as const;

export type RiskDefaults = typeof RISK_DEFAULTS;
