import { loadAppliedSplits } from "@powerfund/db";
import { fillSessionDate, priceBasisNote } from "@powerfund/domain";

import {
  buildDeploymentQueue,
  listOpenPlannedActions,
} from "@/lib/data/planned-actions";
import { getOpenPortfolioBook } from "@/lib/data/portfolio";
import { listInstrumentsWithThemes } from "@/lib/data/research";
import type { DbClient } from "@/lib/supabase/db";

export async function getDeploymentQueue(supabase: DbClient) {
  const [book, instruments, raw, splits] = await Promise.all([
    getOpenPortfolioBook(supabase),
    listInstrumentsWithThemes(supabase),
    listOpenPlannedActions(supabase),
    loadAppliedSplits(supabase),
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
      // A plan is sized in dollars, which a split does not touch — but its
      // window and rationale usually quote a price, and "buy below $1,800"
      // reads as satisfied the morning the share count multiplies by eight.
      // Nothing is reactivated or re-priced here; the reader is told.
      price_basis_note: priceBasisNote(
        splits,
        row.instrumentId,
        fillSessionDate(row.createdAt),
        "This planned action",
      ),
    })),
  };
}
