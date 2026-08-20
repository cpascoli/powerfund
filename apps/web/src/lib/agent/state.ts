import { RISK_DEFAULTS } from "@powerfund/domain";

import { getPlaybookDoc } from "@/lib/docs";
import { listDecisions } from "@/lib/data/decisions";
import { getLedgerSummary } from "@/lib/data/ledger";
import {
  buildDeploymentQueue,
  listOpenPlannedActions,
} from "@/lib/data/planned-actions";
import { getOpenPortfolioBook } from "@/lib/data/portfolio";
import {
  listInstrumentsWithThemes,
  listThemes,
} from "@/lib/data/research";
import { getReviewRadar } from "@/lib/reviews/queue";
import type { DbClient } from "@/lib/supabase/db";

import { toPrivatePortfolio } from "./portfolio";

export type FundStateQuery = {
  recent_decisions?: number;
  include_watchlist?: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export async function getFundState(
  supabase: DbClient,
  query: FundStateQuery = {},
) {
  const recentLimit = clamp(query.recent_decisions ?? 20, 1, 50);
  const includeWatchlist = query.include_watchlist !== false;

  const [book, ledger, instruments, themes, plannedRaw, decisions, radar] =
    await Promise.all([
      getOpenPortfolioBook(supabase),
      getLedgerSummary(12, supabase),
      listInstrumentsWithThemes(supabase),
      listThemes(supabase),
      listOpenPlannedActions(supabase),
      listDecisions(supabase),
      getReviewRadar(supabase),
    ]);

  const queue = buildDeploymentQueue(book, instruments, plannedRaw);
  const privateBook = toPrivatePortfolio(book, ledger);

  const { data: dossierRows, error } = await supabase
    .from("dossiers")
    .select("id, instrument_id, status, research_level");
  if (error) {
    throw new Error(`Failed to load dossiers: ${error.message}`);
  }

  const dossierIds = (dossierRows ?? []).map((row) => row.id);
  const { data: versions, error: versionError } = dossierIds.length
    ? await supabase
        .from("dossier_versions")
        .select("id, dossier_id, version_number")
        .in("dossier_id", dossierIds)
        .order("version_number", { ascending: false })
    : { data: [] as Array<{ id: string; dossier_id: string; version_number: number }>, error: null };
  if (versionError) {
    throw new Error(`Failed to load dossier versions: ${versionError.message}`);
  }

  const latestByDossier = new Map<
    string,
    { id: string; version_number: number }
  >();
  for (const version of versions ?? []) {
    if (!latestByDossier.has(version.dossier_id)) {
      latestByDossier.set(version.dossier_id, {
        id: version.id,
        version_number: version.version_number,
      });
    }
  }

  const instrumentById = new Map(instruments.map((row) => [row.id, row]));
  const dossiers = (dossierRows ?? [])
    .map((row) => {
      const instrument = instrumentById.get(row.instrument_id);
      if (!instrument) return null;
      const latest = latestByDossier.get(row.id);
      return {
        symbol: instrument.symbol,
        status: row.status,
        research_level: row.research_level,
        current_version_id: latest?.id ?? null,
        current_version_number: latest?.version_number ?? 0,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null)
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  const mandate = getPlaybookDoc("mandate");
  const goals = getPlaybookDoc("goals");

  return {
    as_of: new Date().toISOString(),
    mandate: {
      slug: mandate?.slug ?? "mandate",
      title: mandate?.title ?? "Mandate",
      description: mandate?.description ?? null,
      risk_defaults: RISK_DEFAULTS,
    },
    goals: {
      slug: goals?.slug ?? "goals",
      title: goals?.title ?? "Goals",
      description: goals?.description ?? null,
    },
    cash: privateBook.cash,
    portfolio: {
      nav_usd: privateBook.nav_usd,
      invested_cost_usd: privateBook.invested_cost_usd,
      market_value_usd: privateBook.market_value_usd,
      unrealized_pnl_usd: privateBook.unrealized_pnl_usd,
      realized_pnl_usd: privateBook.realized_pnl_usd,
      deposited_capital_usd: privateBook.deposited_capital_usd,
      flags: privateBook.flags,
      mark: privateBook.mark,
    },
    theme_exposure: privateBook.theme_exposure,
    holdings: privateBook.holdings,
    ...(includeWatchlist
      ? {
          watchlist: instruments.map((row) => ({
            symbol: row.symbol,
            name: row.name,
            status: row.status,
            theme: { slug: row.theme_slug, name: row.theme_name },
            has_dossier: row.has_dossier,
          })),
          themes: themes.map((theme) => ({
            slug: theme.slug,
            name: theme.name,
            is_core: theme.is_core,
          })),
        }
      : {}),
    planned_actions: queue.actions.map((row) => ({
      id: row.id,
      symbol: row.symbol,
      action_type: row.actionType,
      status: row.status,
      planned_usd: row.plannedUsd,
      planned_pct_nav: row.plannedPctNav,
      window_label: row.windowLabel,
      due_by: row.dueBy,
      rationale: row.rationale,
    })),
    recent_decisions: decisions.slice(0, recentLimit).map((row) => ({
      id: row.id,
      action_at: row.action_at,
      decision_type: row.decision_type,
      symbol: row.symbol,
      thesis: row.thesis,
      dossier_version: row.dossier_version,
    })),
    dossiers,
    due_reviews: radar.due_reviews,
    upcoming_reviews: radar.upcoming_reviews,
  };
}
