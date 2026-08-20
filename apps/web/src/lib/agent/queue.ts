import {
  buildDeploymentQueue,
  listOpenPlannedActions,
} from "@/lib/data/planned-actions";
import { getOpenPortfolioBook } from "@/lib/data/portfolio";
import { listInstrumentsWithThemes } from "@/lib/data/research";
import type { DbClient } from "@/lib/supabase/db";

export async function getDeploymentQueue(supabase: DbClient) {
  const [book, instruments, raw] = await Promise.all([
    getOpenPortfolioBook(supabase),
    listInstrumentsWithThemes(supabase),
    listOpenPlannedActions(supabase),
  ]);
  const queue = buildDeploymentQueue(book, instruments, raw);
  return {
    as_of: new Date().toISOString(),
    total_planned_usd: queue.totalPlannedUsd,
    cash_after_usd: queue.cashAfter,
    cash_pct_after: queue.cashPctAfter,
    invested_after_usd: queue.investedAfter,
    flags: queue.flags,
    actions: queue.actions.map((row) => ({
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      theme: { slug: row.themeSlug, name: row.themeName },
      action_type: row.actionType,
      status: row.status,
      planned_usd: row.plannedUsd,
      planned_pct_nav: row.plannedPctNav,
      window_label: row.windowLabel,
      due_by: row.dueBy,
      rationale: row.rationale,
      created_at: row.createdAt,
    })),
  };
}
