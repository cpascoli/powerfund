import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateReviewTriggers,
  parseReviewTrigger,
  returnPctKey,
  type MarketObservation,
  type ReviewTriggerTask,
} from "@powerfund/domain";

import type { Database } from "./database.types";

/**
 * Review-trigger IO, shared by the web app and the worker so there is one
 * implementation of "which pending reviews have fired". The decision itself
 * is `evaluateReviewTriggers` in @powerfund/domain; this file only loads what
 * it needs and, when asked, records the result.
 *
 * Two operations, deliberately separate:
 *
 * - `findDueReviewTaskIds` reads. It is what a read-only caller (the MCP
 *   tools) uses to show a review as due without changing anything.
 * - `latchDueReviewTasks` writes `pending → due`. The write is not
 *   bookkeeping: a price condition is evaluated against the latest close and
 *   can stop being true. If MRCY closes at 49 against "revisit below 50" and
 *   then recovers to 52, the obligation must still stand. The latch is what
 *   keeps it. Date triggers are monotonic, so for them the write only records
 *   when the review was first seen due.
 *
 * The latch runs after every bars ingest (the only time a condition's inputs
 * change) and on the paths that always ran it: the Briefing page and the REST
 * agent API's default reads.
 */

type Db = SupabaseClient<Database>;

function utcDate(asOf: Date): string {
  return asOf.toISOString().slice(0, 10);
}

function shiftUtcDate(asOf: Date, days: number): string {
  return new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate() - days),
  )
    .toISOString()
    .slice(0, 10);
}

async function lastCloseOnOrBefore(
  db: Db,
  instrumentId: string,
  asOfDate: string,
): Promise<number | null> {
  const { data, error } = await db
    .from("market_bars")
    .select("close, adj_close")
    .eq("instrument_id", instrumentId)
    .lte("bar_date", asOfDate)
    .order("bar_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load market bars: ${error.message}`);
  }
  const close = data?.adj_close ?? data?.close;
  return close == null ? null : Number(close);
}

export async function loadPendingTriggerTasks(db: Db): Promise<ReviewTriggerTask[]> {
  const { data, error } = await db
    .from("review_tasks")
    .select("id, status, trigger")
    .eq("status", "pending");
  if (error) {
    throw new Error(`Failed to load pending review tasks: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    status: row.status as ReviewTriggerTask["status"],
    trigger: parseReviewTrigger(row.trigger),
  }));
}

export async function loadMarketObservation(
  db: Db,
  tasks: readonly ReviewTriggerTask[],
  asOf: Date,
): Promise<MarketObservation> {
  const symbols = new Set<string>();
  const returnSpecs: Array<{ symbol: string; lookbackDays: number }> = [];
  for (const task of tasks) {
    if (task.trigger.type !== "condition") continue;
    symbols.add(task.trigger.symbol);
    if (task.trigger.metric === "price_return_pct" && task.trigger.lookback_days != null) {
      returnSpecs.push({ symbol: task.trigger.symbol, lookbackDays: task.trigger.lookback_days });
    }
  }

  const lastPrice: Record<string, number | null> = {};
  const returnPct: Record<string, number | null> = {};
  if (symbols.size === 0) {
    return { lastPrice, returnPct };
  }

  const { data, error } = await db
    .from("instruments")
    .select("id, symbol")
    .in("symbol", [...symbols]);
  if (error) {
    throw new Error(`Failed to load instruments: ${error.message}`);
  }
  const idBySymbol = new Map((data ?? []).map((row) => [row.symbol, row.id]));
  const asOfDate = utcDate(asOf);

  for (const symbol of symbols) {
    const instrumentId = idBySymbol.get(symbol);
    lastPrice[symbol] = instrumentId ? await lastCloseOnOrBefore(db, instrumentId, asOfDate) : null;
  }

  for (const spec of returnSpecs) {
    const key = returnPctKey(spec.symbol, spec.lookbackDays);
    const instrumentId = idBySymbol.get(spec.symbol);
    if (!instrumentId) {
      returnPct[key] = null;
      continue;
    }
    const latest = lastPrice[spec.symbol];
    const prior = await lastCloseOnOrBefore(db, instrumentId, shiftUtcDate(asOf, spec.lookbackDays));
    returnPct[key] = latest == null || prior == null || prior === 0 ? null : ((latest - prior) / prior) * 100;
  }

  return { lastPrice, returnPct };
}

/** Pending reviews whose trigger is satisfied now. Reads only. */
export async function findDueReviewTaskIds(db: Db, asOf = new Date()): Promise<string[]> {
  const tasks = await loadPendingTriggerTasks(db);
  if (tasks.length === 0) return [];
  const market = await loadMarketObservation(db, tasks, asOf);
  return evaluateReviewTriggers(tasks, asOf, market).markDueIds;
}

export async function markReviewTasksDue(
  db: Db,
  ids: readonly string[],
  asOf: Date,
): Promise<number> {
  if (ids.length === 0) return 0;
  const { data, error } = await db
    .from("review_tasks")
    .update({ status: "due", became_due_at: asOf.toISOString() })
    .in("id", [...ids])
    // Only ever pending → due: a task moved on meanwhile is left alone.
    .eq("status", "pending")
    .select("id");
  if (error) {
    throw new Error(`Failed to mark review tasks due: ${error.message}`);
  }
  return data?.length ?? 0;
}

/** Record every fired trigger: pending → due. Returns how many flipped. */
export async function latchDueReviewTasks(db: Db, asOf = new Date()): Promise<number> {
  return markReviewTasksDue(db, await findDueReviewTaskIds(db, asOf), asOf);
}
