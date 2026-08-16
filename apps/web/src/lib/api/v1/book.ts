import {
  aiCapexNavPct,
  aiMemoryNavPct,
  RISK_DEFAULTS,
  unclassifiedSymbols,
} from "@powerfund/domain";

import { createAdminClient } from "@/lib/supabase/admin";

export type PublicPosition = {
  symbol: string;
  name: string;
  theme: { slug: string; name: string };
  side: "long" | "short";
  weight_pct_nav: number | null;
  return_pct: number | null;
  opened_at: string;
  thesis_summary: string | null;
};

export type PublicThemeWeight = {
  slug: string;
  name: string;
  weight_pct_nav: number;
};

export type PublicMandateFlag = {
  code: string;
  severity: "warn" | "ok";
  label: string;
};

export type PublicPortfolio = {
  cash_pct_nav: number;
  deployed_pct_nav: number;
  ai_capex_pct_nav: number | null;
  ai_memory_pct_nav: number | null;
  positions: PublicPosition[];
  themes: PublicThemeWeight[];
  flags: PublicMandateFlag[];
};

export type PublicJournalEntry = {
  id: string;
  action_at: string;
  decision_type: string;
  symbol: string | null;
  name: string | null;
  thesis: string;
  catalysts: string | null;
  risks: string | null;
  invalidation: string | null;
  outcome_notes: string | null;
  outcome_grade: string | null;
  reviewed_at: string | null;
};

function pct1(value: number | null): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(value * 10) / 10;
}

export async function getPublicPortfolio(): Promise<PublicPortfolio> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const [
    { data: positionData, error: positionError },
    { data: stateData, error: stateError },
  ] = await Promise.all([
    supabase
      .from("positions")
      .select("instrument_id, side, quantity, avg_cost, opened_at, thesis_summary")
      .eq("status", "open")
      .order("opened_at", { ascending: false }),
    supabase
      .from("portfolio_state")
      .select("cash")
      .limit(1)
      .maybeSingle(),
  ]);

  if (positionError) {
    throw new Error(`Failed to load positions: ${positionError.message}`);
  }
  if (stateError) {
    throw new Error(`Failed to load cash: ${stateError.message}`);
  }

  const cash = Number(
    (stateData as { cash: number } | null)?.cash ?? 0,
  );
  const positions =
    (positionData as Array<{
      instrument_id: string;
      side: "long" | "short";
      quantity: number;
      avg_cost: number;
      opened_at: string;
      thesis_summary: string | null;
    }> | null) ?? [];

  if (positions.length === 0) {
    return {
      cash_pct_nav: 100,
      deployed_pct_nav: 0,
      ai_capex_pct_nav: 0,
      ai_memory_pct_nav: 0,
      positions: [],
      themes: [],
      flags: [
        {
          code: "all_clear",
          severity: "ok",
          label: "Mandate checks clear vs NAV",
        },
      ],
    };
  }

  const instrumentIds = [...new Set(positions.map((row) => row.instrument_id))];
  const [{ data: instruments, error: instrumentError }, { data: links }] =
    await Promise.all([
      supabase
        .from("instruments")
        .select("id, symbol, name")
        .in("id", instrumentIds),
      supabase
        .from("instrument_themes")
        .select("instrument_id, theme_id, is_primary")
        .in("instrument_id", instrumentIds),
    ]);

  if (instrumentError) {
    throw new Error(`Failed to load instruments: ${instrumentError.message}`);
  }

  const themeIds = [
    ...new Set(
      ((links as Array<{ theme_id: string }> | null) ?? []).map(
        (row) => row.theme_id,
      ),
    ),
  ];
  const { data: themes } = themeIds.length
    ? await supabase.from("themes").select("id, name, slug").in("id", themeIds)
    : { data: [] as Array<{ id: string; name: string; slug: string }> };

  const instrumentMap = new Map(
    ((instruments as Array<{
      id: string;
      symbol: string;
      name: string;
    }> | null) ?? []).map((row) => [row.id, row]),
  );
  const themeById = new Map(
    ((themes as Array<{ id: string; name: string; slug: string }> | null) ??
      []).map((row) => [row.id, row]),
  );
  const primaryTheme = new Map<string, { name: string; slug: string }>();
  for (const link of (links as Array<{
    instrument_id: string;
    theme_id: string;
    is_primary: boolean;
  }> | null) ?? []) {
    const theme = themeById.get(link.theme_id);
    if (!theme) continue;
    if (link.is_primary || !primaryTheme.has(link.instrument_id)) {
      primaryTheme.set(link.instrument_id, {
        name: theme.name,
        slug: theme.slug,
      });
    }
  }

  const closes = await Promise.all(
    instrumentIds.map(async (instrumentId) => {
      const { data } = await supabase
        .from("market_bars")
        .select("close, adj_close")
        .eq("instrument_id", instrumentId)
        .order("bar_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      const bar = data as {
        close: number | null;
        adj_close: number | null;
      } | null;
      return [instrumentId, bar?.adj_close ?? bar?.close ?? null] as const;
    }),
  );
  const closeMap = new Map(closes);

  const valued = positions.map((position) => {
    const instrument = instrumentMap.get(position.instrument_id);
    const quantity = Number(position.quantity);
    const costBasis = quantity * Number(position.avg_cost);
    const lastClose = closeMap.get(position.instrument_id) ?? null;
    const marketValue = lastClose == null ? costBasis : quantity * lastClose;
    const returnPct =
      costBasis === 0 ? null : ((marketValue - costBasis) / costBasis) * 100;
    const theme = primaryTheme.get(position.instrument_id);
    return {
      symbol: instrument?.symbol ?? "—",
      name: instrument?.name ?? "Unknown",
      themeSlug: theme?.slug ?? "other",
      themeName: theme?.name ?? "—",
      side: position.side,
      marketValue,
      returnPct,
      openedAt: position.opened_at,
      thesisSummary: position.thesis_summary,
    };
  });

  const deployed = valued.reduce((sum, row) => sum + row.marketValue, 0);
  const nav = cash + deployed;
  const cashPctNav = nav > 0 ? (cash / nav) * 100 : 100;
  const deployedPctNav = nav > 0 ? (deployed / nav) * 100 : 0;

  const publicPositions: PublicPosition[] = valued
    .map((row) => ({
      symbol: row.symbol,
      name: row.name,
      theme: { slug: row.themeSlug, name: row.themeName },
      side: row.side,
      weight_pct_nav: pct1(nav > 0 ? (row.marketValue / nav) * 100 : null),
      return_pct: pct1(row.returnPct),
      opened_at: row.openedAt,
      thesis_summary: row.thesisSummary,
    }))
    .sort((a, b) => (b.weight_pct_nav ?? 0) - (a.weight_pct_nav ?? 0));

  const byTheme = new Map<string, { name: string; value: number }>();
  for (const row of valued) {
    const existing = byTheme.get(row.themeSlug);
    if (existing) {
      existing.value += row.marketValue;
    } else {
      byTheme.set(row.themeSlug, { name: row.themeName, value: row.marketValue });
    }
  }

  const themeWeights: PublicThemeWeight[] = [...byTheme.entries()]
    .map(([slug, row]) => ({
      slug,
      name: row.name,
      weight_pct_nav: pct1(nav > 0 ? (row.value / nav) * 100 : 0) ?? 0,
    }))
    .sort((a, b) => b.weight_pct_nav - a.weight_pct_nav);

  const mandatePositions = valued.map((row) => ({
    symbol: row.symbol,
    themeSlug: row.themeSlug,
    marketValue: row.marketValue,
    costBasis: row.marketValue,
  }));
  const factorPct = aiCapexNavPct(mandatePositions, nav);
  const memoryPct = aiMemoryNavPct(mandatePositions, nav);

  const flags: PublicMandateFlag[] = [];
  const oversized = publicPositions.filter(
    (row) =>
      row.weight_pct_nav != null &&
      row.weight_pct_nav > RISK_DEFAULTS.maxPositionPctNav,
  );
  if (oversized.length > 0) {
    flags.push({
      code: "position_cap",
      severity: "warn",
      label: `${oversized.map((row) => row.symbol).join(", ")} above ${RISK_DEFAULTS.maxPositionPctNav}% NAV`,
    });
  }

  const hotThemes = themeWeights.filter(
    (theme) => theme.weight_pct_nav > RISK_DEFAULTS.maxThemePctNav,
  );
  if (hotThemes.length > 0) {
    flags.push({
      code: "theme_cap",
      severity: "warn",
      label: `${hotThemes.map((theme) => theme.name).join(", ")} above ${RISK_DEFAULTS.maxThemePctNav}% NAV`,
    });
  }

  if (cashPctNav < RISK_DEFAULTS.minCashPctNav) {
    flags.push({
      code: "cash_floor",
      severity: "warn",
      label: `Cash ${pct1(cashPctNav)}% is below ${RISK_DEFAULTS.minCashPctNav}% floor`,
    });
  }

  if (
    factorPct != null &&
    factorPct > RISK_DEFAULTS.maxAiCapexFactorPctNav
  ) {
    flags.push({
      code: "ai_capex_factor",
      severity: "warn",
      label: `AI-capex complex is ${pct1(factorPct)}% of NAV (cap ${RISK_DEFAULTS.maxAiCapexFactorPctNav}%)`,
    });
  }

  if (
    memoryPct != null &&
    memoryPct > RISK_DEFAULTS.maxAiMemorySleevePctNav
  ) {
    flags.push({
      code: "ai_memory_sleeve",
      severity: "warn",
      label: `AI memory/storage sleeve is ${pct1(memoryPct)}% of NAV (guide ${RISK_DEFAULTS.maxAiMemorySleevePctNav}%)`,
    });
  }

  const unknown = unclassifiedSymbols(valued.map((row) => row.symbol));
  if (unknown.length > 0) {
    flags.push({
      code: "factor_unclassified",
      severity: "warn",
      label: `${unknown.join(", ")} unclassified vs the AI-capex factor`,
    });
  }

  if (flags.length === 0) {
    flags.push({
      code: "all_clear",
      severity: "ok",
      label: "Mandate checks clear vs NAV",
    });
  }

  return {
    cash_pct_nav: pct1(cashPctNav) ?? 0,
    deployed_pct_nav: pct1(deployedPctNav) ?? 0,
    ai_capex_pct_nav: pct1(factorPct),
    ai_memory_pct_nav: pct1(memoryPct),
    positions: publicPositions,
    themes: themeWeights,
    flags,
  };
}

export async function listPublicJournal(): Promise<PublicJournalEntry[]> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const { data, error } = await supabase
    .from("decisions")
    .select(
      "id, instrument_id, decision_type, thesis, catalysts, risks, invalidation, action_at, outcome_notes, outcome_grade, reviewed_at",
    )
    .order("action_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load journal: ${error.message}`);
  }

  const rows =
    (data as Array<{
      id: string;
      instrument_id: string | null;
      decision_type: string;
      thesis: string;
      catalysts: string | null;
      risks: string | null;
      invalidation: string | null;
      action_at: string;
      outcome_notes: string | null;
      outcome_grade: string | null;
      reviewed_at: string | null;
    }> | null) ?? [];

  const instrumentIds = [
    ...new Set(
      rows
        .map((row) => row.instrument_id)
        .filter((id): id is string => id != null),
    ),
  ];
  const { data: instruments } = instrumentIds.length
    ? await supabase
        .from("instruments")
        .select("id, symbol, name")
        .in("id", instrumentIds)
    : { data: [] as Array<{ id: string; symbol: string; name: string }> };

  const byId = new Map(
    ((instruments as Array<{
      id: string;
      symbol: string;
      name: string;
    }> | null) ?? []).map((row) => [row.id, row]),
  );

  return rows.map((row) => {
    const instrument = row.instrument_id
      ? byId.get(row.instrument_id)
      : undefined;
    return {
      id: row.id,
      action_at: row.action_at,
      decision_type: row.decision_type,
      symbol: instrument?.symbol ?? null,
      name: instrument?.name ?? null,
      thesis: row.thesis,
      catalysts: row.catalysts,
      risks: row.risks,
      invalidation: row.invalidation,
      outcome_notes: row.outcome_notes,
      outcome_grade: row.outcome_grade,
      reviewed_at: row.reviewed_at,
    };
  });
}

export function portfolioMarkdown(book: PublicPortfolio): string {
  const lines = [
    "# Portfolio",
    "",
    "Weights of NAV. No dollar amounts.",
    "",
    `- Cash: ${book.cash_pct_nav}% NAV`,
    `- Deployed: ${book.deployed_pct_nav}% NAV`,
    `- AI-capex complex: ${book.ai_capex_pct_nav ?? "—"}% NAV`,
    `- AI memory/storage sleeve: ${book.ai_memory_pct_nav ?? "—"}% NAV`,
    "",
    "## Positions",
    "",
    "| Symbol | Theme | Side | Weight | Return |",
    "| --- | --- | --- | --- | --- |",
    ...book.positions.map((row) => {
      const weight = row.weight_pct_nav == null ? "—" : `${row.weight_pct_nav}%`;
      const ret = row.return_pct == null ? "—" : `${row.return_pct}%`;
      return `| ${row.symbol} | ${row.theme.name} | ${row.side} | ${weight} | ${ret} |`;
    }),
    "",
    "## Themes",
    "",
    ...book.themes.map(
      (theme) => `- ${theme.name}: ${theme.weight_pct_nav}% NAV`,
    ),
    "",
    "## Mandate flags",
    "",
    ...book.flags.map((flag) => `- ${flag.severity}: ${flag.label}`),
    "",
  ];

  const theses = book.positions.filter((row) => row.thesis_summary);
  if (theses.length > 0) {
    lines.push("## Position theses", "");
    for (const row of theses) {
      lines.push(`### ${row.symbol}`, "", row.thesis_summary ?? "", "");
    }
  }

  return lines.join("\n");
}

export function journalMarkdown(entries: PublicJournalEntry[]): string {
  const lines = ["# Journal", "", "Decision log. No dollar amounts.", ""];
  if (entries.length === 0) {
    lines.push("No entries yet.", "");
    return lines.join("\n");
  }

  for (const entry of entries) {
    const title = entry.symbol
      ? `${entry.decision_type} ${entry.symbol}`
      : entry.decision_type;
    lines.push(`## ${title}`);
    lines.push("");
    lines.push(`- Date: ${entry.action_at.slice(0, 10)}`);
    if (entry.name) lines.push(`- Name: ${entry.name}`);
    if (entry.outcome_grade) lines.push(`- Outcome: ${entry.outcome_grade}`);
    lines.push("", entry.thesis, "");
    if (entry.catalysts) lines.push("### Catalysts", "", entry.catalysts, "");
    if (entry.risks) lines.push("### Risks", "", entry.risks, "");
    if (entry.invalidation) {
      lines.push("### Invalidation", "", entry.invalidation, "");
    }
    if (entry.outcome_notes) {
      lines.push("### Outcome notes", "", entry.outcome_notes, "");
    }
  }

  return lines.join("\n");
}
