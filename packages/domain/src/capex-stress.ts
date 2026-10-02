import { aiCapexWeight, aiMemoryWeight } from "./risk";

/**
 * The standing stress in mandate rule 10: hyperscaler capex falls and every
 * holding loses 20% times its mapped AI-capex weight (`ai_capex` +
 * `ai_memory`, from FACTOR_EXPOSURES). Unclassified names are left unchanged
 * and listed, so a gap in the factor map shows instead of reading as safety.
 * A sizing discipline, not a forecast.
 *
 * One implementation for the Workbench Risk panel and the agent API, so the
 * quarterly review quotes the number the operator sees.
 */
export const HYPERSCALER_CAPEX_SHOCK = 0.2;

export type CapexStressHolding = {
  symbol: string;
  themeSlug: string;
  themeName: string;
  marketValue: number;
};

export type CapexStressRow = CapexStressHolding & {
  /** null = unclassified, left unshocked. */
  aiCapexWeight: number | null;
  aiMemoryWeight: number | null;
  /** Loss in dollars, ≥ 0. */
  delta: number;
  /** Of that loss, the part from the ai_memory loading. */
  memoryDelta: number;
};

export type CapexStressResult = {
  shock: number;
  nav: number;
  navDelta: number;
  navDeltaPct: number | null;
  stressedNav: number;
  rows: CapexStressRow[];
  byTheme: Array<{ themeSlug: string; themeName: string; marketValue: number; delta: number }>;
  unclassified: string[];
};

export function hyperscalerCapexStress(
  holdings: readonly CapexStressHolding[],
  nav: number,
  shock: number = HYPERSCALER_CAPEX_SHOCK,
): CapexStressResult {
  const rows: CapexStressRow[] = holdings.map((row) => {
    const capex = aiCapexWeight(row.symbol);
    const memory = aiMemoryWeight(row.symbol);
    return {
      ...row,
      aiCapexWeight: capex,
      aiMemoryWeight: memory,
      delta: capex == null ? 0 : shock * row.marketValue * capex,
      memoryDelta: memory == null ? 0 : shock * row.marketValue * memory,
    };
  });
  const navDelta = rows.reduce((sum, row) => sum + row.delta, 0);

  const themes = new Map<string, CapexStressResult["byTheme"][number]>();
  for (const row of rows) {
    const theme = themes.get(row.themeSlug) ?? {
      themeSlug: row.themeSlug,
      themeName: row.themeName,
      marketValue: 0,
      delta: 0,
    };
    theme.marketValue += row.marketValue;
    theme.delta += row.delta;
    themes.set(row.themeSlug, theme);
  }

  return {
    shock,
    nav,
    navDelta,
    navDeltaPct: nav > 0 ? (navDelta / nav) * 100 : null,
    stressedNav: nav - navDelta,
    rows,
    byTheme: [...themes.values()].sort((a, b) => b.delta - a.delta),
    unclassified: rows.filter((row) => row.aiCapexWeight == null).map((row) => row.symbol),
  };
}
