import {
  evaluateReviewTriggers,
  parseReviewTrigger,
  returnPctKey,
  type MarketObservation,
  type ReviewTriggerTask,
} from "@powerfund/domain";

import type { DbClient } from "@/lib/supabase/db";

import { listReviewTaskRows } from "./records";

function utcDate(asOf: Date): string {
  return asOf.toISOString().slice(0, 10);
}

function shiftUtcDate(asOf: Date, days: number): string {
  const shifted = new Date(Date.UTC(
    asOf.getUTCFullYear(),
    asOf.getUTCMonth(),
    asOf.getUTCDate() - days,
  ));
  return shifted.toISOString().slice(0, 10);
}

async function lastCloseOnOrBefore(
  supabase: DbClient,
  instrumentId: string,
  asOfDate: string,
): Promise<number | null> {
  const { data, error } = await supabase
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

export async function loadMarketObservation(
  supabase: DbClient,
  tasks: readonly ReviewTriggerTask[],
  asOf: Date,
): Promise<MarketObservation> {
  const symbols = new Set<string>();
  const returnSpecs: Array<{ symbol: string; lookbackDays: number }> = [];
  for (const task of tasks) {
    if (task.trigger.type !== "condition") continue;
    symbols.add(task.trigger.symbol);
    if (
      task.trigger.metric === "price_return_pct" &&
      task.trigger.lookback_days != null
    ) {
      returnSpecs.push({
        symbol: task.trigger.symbol,
        lookbackDays: task.trigger.lookback_days,
      });
    }
  }

  const lastPrice: Record<string, number | null> = {};
  const returnPct: Record<string, number | null> = {};
  if (symbols.size === 0) {
    return { lastPrice, returnPct };
  }

  const { data, error } = await supabase
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
    lastPrice[symbol] = instrumentId
      ? await lastCloseOnOrBefore(supabase, instrumentId, asOfDate)
      : null;
  }

  for (const spec of returnSpecs) {
    const key = returnPctKey(spec.symbol, spec.lookbackDays);
    const instrumentId = idBySymbol.get(spec.symbol);
    if (!instrumentId) {
      returnPct[key] = null;
      continue;
    }
    const latest = lastPrice[spec.symbol];
    const prior = await lastCloseOnOrBefore(
      supabase,
      instrumentId,
      shiftUtcDate(asOf, spec.lookbackDays),
    );
    if (latest == null || prior == null || prior === 0) {
      returnPct[key] = null;
      continue;
    }
    returnPct[key] = ((latest - prior) / prior) * 100;
  }

  return { lastPrice, returnPct };
}

export async function markReviewTasksDue(
  supabase: DbClient,
  ids: readonly string[],
  asOf: Date,
): Promise<number> {
  if (ids.length === 0) return 0;
  const { data, error } = await supabase
    .from("review_tasks")
    .update({
      status: "due",
      became_due_at: asOf.toISOString(),
    })
    .in("id", [...ids])
    .eq("status", "pending")
    .select("id");
  if (error) {
    throw new Error(`Failed to mark review tasks due: ${error.message}`);
  }
  return data?.length ?? 0;
}

export async function evaluateStoredReviewTriggers(
  supabase: DbClient,
  asOf = new Date(),
): Promise<number> {
  const rows = await listReviewTaskRows(supabase, ["pending"]);
  const tasks: ReviewTriggerTask[] = rows.map((row) => ({
    id: row.id,
    status: row.status,
    trigger: parseReviewTrigger(row.trigger),
  }));
  const market = await loadMarketObservation(supabase, tasks, asOf);
  const { markDueIds } = evaluateReviewTriggers(tasks, asOf, market);
  return markReviewTasksDue(supabase, markDueIds, asOf);
}
