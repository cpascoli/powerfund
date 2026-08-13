import { RISK_DEFAULTS } from "@powerfund/domain";

import type { MandateFlag, PortfolioBook } from "@/lib/data/portfolio";
import { createClient } from "@/lib/supabase/server";

export type PlannedActionType = "buy" | "add" | "reduce" | "sell";
export type PlannedActionStatus =
  | "pending"
  | "deferred"
  | "confirmed"
  | "cancelled";

export type PlannedActionRow = {
  id: string;
  instrumentId: string;
  symbol: string;
  name: string;
  themeName: string;
  themeSlug: string;
  actionType: PlannedActionType;
  status: PlannedActionStatus;
  plannedUsd: number;
  plannedPctNav: number | null;
  windowLabel: string | null;
  dueBy: string | null;
  rationale: string | null;
  createdAt: string;
};

export type DeploymentQueue = {
  actions: PlannedActionRow[];
  totalPlannedUsd: number;
  cashAfter: number;
  cashPctAfter: number;
  investedAfter: number;
  flags: MandateFlag[];
};

type PlannedDbRow = {
  id: string;
  instrument_id: string;
  action_type: PlannedActionType;
  status: PlannedActionStatus;
  planned_usd: number;
  window_label: string | null;
  due_by: string | null;
  rationale: string | null;
  created_at: string;
};

export async function listOpenPlannedActions(): Promise<
  Omit<
    PlannedActionRow,
    "symbol" | "name" | "themeName" | "themeSlug" | "plannedPctNav"
  >[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("planned_actions")
    .select(
      "id, instrument_id, action_type, status, planned_usd, window_label, due_by, rationale, created_at",
    )
    .in("status", ["pending", "deferred"])
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load planned actions: ${error.message}`);
  }

  return ((data as PlannedDbRow[] | null) ?? []).map((row) => ({
    id: row.id,
    instrumentId: row.instrument_id,
    actionType: row.action_type,
    status: row.status,
    plannedUsd: Number(row.planned_usd),
    windowLabel: row.window_label,
    dueBy: row.due_by,
    rationale: row.rationale,
    createdAt: row.created_at,
  }));
}

export function buildDeploymentQueue(
  book: PortfolioBook,
  instruments: Array<{
    id: string;
    symbol: string;
    name: string;
    theme_slug: string;
    theme_name: string;
  }>,
  raw: Awaited<ReturnType<typeof listOpenPlannedActions>>,
): DeploymentQueue {
  const byId = new Map(instruments.map((row) => [row.id, row]));
  const nav = book.nav;
  const actions: PlannedActionRow[] = raw.map((row) => {
    const instrument = byId.get(row.instrumentId);
    return {
      ...row,
      symbol: instrument?.symbol ?? "—",
      name: instrument?.name ?? "Unknown",
      themeName: instrument?.theme_name ?? "—",
      themeSlug: instrument?.theme_slug ?? "other",
      plannedPctNav: nav > 0 ? (row.plannedUsd / nav) * 100 : null,
    };
  });

  const totalPlannedUsd = actions.reduce((sum, row) => sum + row.plannedUsd, 0);
  const cashAfter = book.cash - totalPlannedUsd;
  const cashPctAfter = nav > 0 ? (cashAfter / nav) * 100 : 100;
  const investedAfter = book.invested + totalPlannedUsd;
  const flags: MandateFlag[] = [];

  if (cashAfter < 0) {
    flags.push({
      code: "cash_floor",
      severity: "warn",
      label: `Queue needs ${Math.abs(cashAfter).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
      })} more cash than is available`,
    });
  } else if (cashPctAfter < RISK_DEFAULTS.minCashPctNav) {
    flags.push({
      code: "cash_floor",
      severity: "warn",
      label: `Cash would be ${cashPctAfter.toFixed(1)}% if the queue fills (floor ${RISK_DEFAULTS.minCashPctNav}%)`,
    });
  }

  if (investedAfter > RISK_DEFAULTS.phase1InvestedCapUsd) {
    flags.push({
      code: "phase1_invested",
      severity: "warn",
      label: `Invested cost would be $${Math.round(investedAfter).toLocaleString()} vs $${RISK_DEFAULTS.phase1InvestedCapUsd.toLocaleString()} phase-1 cap`,
    });
  }

  const nameAfter = new Map<string, number>();
  for (const position of book.positions) {
    nameAfter.set(
      position.instrumentId,
      position.marketValue ?? position.costBasis,
    );
  }
  for (const action of actions) {
    nameAfter.set(
      action.instrumentId,
      (nameAfter.get(action.instrumentId) ?? 0) + action.plannedUsd,
    );
  }
  const oversized = [...nameAfter.entries()]
    .filter(([, value]) => nav > 0 && (value / nav) * 100 > RISK_DEFAULTS.maxPositionPctNav)
    .map(([instrumentId]) => {
      const fromBook = book.positions.find((row) => row.instrumentId === instrumentId);
      const fromQueue = actions.find((row) => row.instrumentId === instrumentId);
      return fromBook?.symbol ?? fromQueue?.symbol ?? "—";
    });
  if (oversized.length > 0) {
    flags.push({
      code: "position_cap",
      severity: "warn",
      label: `${[...new Set(oversized)].join(", ")} would be above ${RISK_DEFAULTS.maxPositionPctNav}% NAV`,
    });
  }

  const themeAfter = new Map<string, { name: string; value: number }>();
  for (const theme of book.themeExposures) {
    themeAfter.set(theme.slug, { name: theme.name, value: theme.marketValue });
  }
  for (const action of actions) {
    const existing = themeAfter.get(action.themeSlug);
    if (existing) {
      existing.value += action.plannedUsd;
    } else {
      themeAfter.set(action.themeSlug, {
        name: action.themeName,
        value: action.plannedUsd,
      });
    }
  }
  const hotThemes = [...themeAfter.values()].filter(
    (theme) => nav > 0 && (theme.value / nav) * 100 > RISK_DEFAULTS.maxThemePctNav,
  );
  if (hotThemes.length > 0) {
    flags.push({
      code: "theme_cap",
      severity: "warn",
      label: `${hotThemes.map((theme) => theme.name).join(", ")} would be above ${RISK_DEFAULTS.maxThemePctNav}% NAV`,
    });
  }

  if (flags.length === 0 && actions.length > 0) {
    flags.push({
      code: "all_clear",
      severity: "ok",
      label: "Queue clears mandate checks vs current NAV",
    });
  }

  return {
    actions,
    totalPlannedUsd,
    cashAfter,
    cashPctAfter,
    investedAfter,
    flags,
  };
}
