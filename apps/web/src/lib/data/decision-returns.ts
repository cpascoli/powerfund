import {
  decisionHorizonReturns,
  fillKindForDecision,
  fillSession,
  utcDay,
  type DecisionHorizonReturn,
  type DecisionType,
} from "@powerfund/domain";
import type { Database } from "@powerfund/db";
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient<Database>;
type TransactionKind = Database["public"]["Enums"]["transaction_kind"];

type TxRow = {
  decision_id: string | null;
  occurred_at: string;
  kind: TransactionKind;
  instrument_id: string | null;
};

type BarRow = {
  instrument_id: string;
  bar_date: string;
  close: number | null;
  adj_close: number | null;
};

export type DecisionRelativeReturns = {
  method: "close_to_close";
  fill: {
    occurredAt: string;
    kind: "buy" | "sell";
    session: string;
  } | null;
  reason: "no_fill" | "no_session" | null;
  horizons: DecisionHorizonReturn[];
};

function emptyReturns(
  reason: DecisionRelativeReturns["reason"],
): DecisionRelativeReturns {
  return {
    method: "close_to_close",
    fill: null,
    reason,
    horizons: [],
  };
}

export async function loadDecisionRelativeReturns(
  db: Db,
  decisions: Array<{
    id: string;
    instrument_id: string | null;
    decision_type: DecisionType;
  }>,
  asOf: string,
): Promise<Map<string, DecisionRelativeReturns>> {
  const out = new Map<string, DecisionRelativeReturns>();
  if (decisions.length === 0) return out;

  const ids = decisions.map((row) => row.id);
  const { data: txData, error: txError } = await db
    .from("transactions")
    .select("decision_id, occurred_at, kind, instrument_id")
    .in("decision_id", ids)
    .in("kind", ["buy", "sell"])
    .order("occurred_at", { ascending: true });
  if (txError) {
    throw new Error(`Failed to load fills for decisions: ${txError.message}`);
  }

  const wantedByDecision = new Map(
    decisions.map((row) => [row.id, fillKindForDecision(row.decision_type)]),
  );
  const fills = new Map<string, TxRow>();
  for (const row of (txData as TxRow[] | null) ?? []) {
    if (row.decision_id == null) continue;
    if (fills.has(row.decision_id)) continue;
    const wanted = wantedByDecision.get(row.decision_id);
    if (wanted == null || row.kind !== wanted) continue;
    fills.set(row.decision_id, row);
  }

  for (const row of decisions) {
    if (fillKindForDecision(row.decision_type) == null) {
      out.set(row.id, emptyReturns("no_fill"));
    }
  }

  const fillRows = [...fills.values()].filter(
    (row) => row.instrument_id != null,
  );
  if (fillRows.length === 0) {
    for (const row of decisions) {
      if (!out.has(row.id)) out.set(row.id, emptyReturns("no_fill"));
    }
    return out;
  }

  const { data: benchmarkData, error: benchmarkError } = await db
    .from("benchmarks")
    .select("instrument_id")
    .eq("role", "success")
    .maybeSingle();
  if (benchmarkError) {
    throw new Error(`Failed to load SPY: ${benchmarkError.message}`);
  }
  const spyId = (benchmarkData as { instrument_id: string } | null)
    ?.instrument_id;

  const instrumentIds = [
    ...new Set(
      fillRows
        .map((row) => row.instrument_id)
        .filter((id): id is string => id != null),
    ),
  ];
  if (spyId) instrumentIds.push(spyId);

  const startDate = fillRows.reduce(
    (min, row) => (utcDay(row.occurred_at) < min ? utcDay(row.occurred_at) : min),
    utcDay(fillRows[0]!.occurred_at),
  );

  const { data: barData, error: barError } = await db
    .from("market_bars")
    .select("instrument_id, bar_date, close, adj_close")
    .in("instrument_id", instrumentIds)
    .gte("bar_date", startDate)
    .lte("bar_date", asOf)
    .order("bar_date", { ascending: true });
  if (barError) {
    throw new Error(`Failed to load bars for decision returns: ${barError.message}`);
  }

  const barsByInstrument = new Map<
    string,
    Array<{ date: string; close: number }>
  >();
  const spyDays: string[] = [];
  for (const row of (barData as BarRow[] | null) ?? []) {
    const close = row.adj_close ?? row.close;
    if (close == null) continue;
    const list = barsByInstrument.get(row.instrument_id) ?? [];
    list.push({ date: row.bar_date, close: Number(close) });
    barsByInstrument.set(row.instrument_id, list);
    if (spyId && row.instrument_id === spyId) spyDays.push(row.bar_date);
  }
  const tradingDays =
    spyDays.length > 0
      ? spyDays
      : [...new Set([...barsByInstrument.values()].flatMap((rows) => rows.map((r) => r.date)))].sort();

  for (const decision of decisions) {
    if (out.has(decision.id)) continue;
    const fill = fills.get(decision.id);
    if (fill == null || fill.instrument_id == null) {
      out.set(decision.id, emptyReturns("no_fill"));
      continue;
    }
    const kind = fill.kind === "sell" ? "sell" : "buy";
    const session = fillSession(fill.occurred_at, tradingDays);
    if (session == null) {
      out.set(decision.id, emptyReturns("no_session"));
      continue;
    }
    out.set(decision.id, {
      method: "close_to_close",
      fill: {
        occurredAt: fill.occurred_at,
        kind,
        session,
      },
      reason: null,
      horizons: decisionHorizonReturns({
        fillSession: session,
        asOf,
        tickerBars: barsByInstrument.get(fill.instrument_id) ?? [],
        spyBars: spyId ? (barsByInstrument.get(spyId) ?? []) : [],
      }),
    });
  }

  return out;
}
