import {
  anchorKindForDecision,
  anchorSession,
  decisionClass,
  decisionHorizonReturns,
  fillKindForDecision,
  fillSessionDate,
  type DecisionAnchorKind,
  type DecisionClass,
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

export type DecisionAnchor = {
  kind: DecisionAnchorKind;
  /** The instant the clock starts from: a fill's booking, or the decision itself. */
  at: string;
  session: string;
  /** Only a fill anchor has a side. */
  fillKind: "buy" | "sell" | null;
};

export type DecisionRelativeReturns = {
  method: "close_to_close";
  decisionClass: DecisionClass;
  anchor: DecisionAnchor | null;
  /**
   * The fill anchor in its original shape. Kept because the agent journal has
   * published it since August and a hold, which has no fill, must read as null
   * there rather than as a fill that failed to load.
   */
  fill: {
    occurredAt: string;
    kind: "buy" | "sell";
    session: string;
  } | null;
  reason: "no_fill" | "no_session" | "no_instrument" | null;
  horizons: DecisionHorizonReturn[];
};

function emptyReturns(
  decisionType: DecisionType,
  reason: DecisionRelativeReturns["reason"],
): DecisionRelativeReturns {
  return {
    method: "close_to_close",
    decisionClass: decisionClass(decisionType),
    anchor: null,
    fill: null,
    reason,
    horizons: [],
  };
}

/** A decision's clock start, before it is mapped onto a trading session. */
type PendingAnchor = {
  decisionId: string;
  decisionType: DecisionType;
  instrumentId: string;
  kind: DecisionAnchorKind;
  at: string;
  fillKind: "buy" | "sell" | null;
};

export async function loadDecisionRelativeReturns(
  db: Db,
  decisions: Array<{
    id: string;
    instrument_id: string | null;
    decision_type: DecisionType;
    action_at: string;
  }>,
  asOf: string,
): Promise<Map<string, DecisionRelativeReturns>> {
  const out = new Map<string, DecisionRelativeReturns>();
  if (decisions.length === 0) return out;

  // Only fill-anchored decisions need a transaction looked up. A hold has none
  // and previously fell out here as `no_fill`, which is why 42 of the 57
  // decisions had no computable return at all.
  const fillAnchored = decisions.filter(
    (row) => anchorKindForDecision(row.decision_type) === "fill",
  );

  const fills = new Map<string, TxRow>();
  if (fillAnchored.length > 0) {
    const { data: txData, error: txError } = await db
      .from("transactions")
      .select("decision_id, occurred_at, kind, instrument_id")
      .in("decision_id", fillAnchored.map((row) => row.id))
      .in("kind", ["buy", "sell"])
      .order("occurred_at", { ascending: true });
    if (txError) {
      throw new Error(`Failed to load fills for decisions: ${txError.message}`);
    }

    const wantedByDecision = new Map(
      fillAnchored.map((row) => [row.id, fillKindForDecision(row.decision_type)]),
    );
    for (const row of (txData as TxRow[] | null) ?? []) {
      if (row.decision_id == null) continue;
      if (fills.has(row.decision_id)) continue;
      const wanted = wantedByDecision.get(row.decision_id);
      if (wanted == null || row.kind !== wanted) continue;
      fills.set(row.decision_id, row);
    }
  }

  const anchors: PendingAnchor[] = [];
  for (const row of decisions) {
    if (anchorKindForDecision(row.decision_type) === "fill") {
      const fill = fills.get(row.id);
      const instrumentId = fill?.instrument_id ?? row.instrument_id;
      if (fill == null || instrumentId == null) {
        out.set(row.id, emptyReturns(row.decision_type, "no_fill"));
        continue;
      }
      anchors.push({
        decisionId: row.id,
        decisionType: row.decision_type,
        instrumentId,
        kind: "fill",
        at: fill.occurred_at,
        fillKind: fill.kind === "sell" ? "sell" : "buy",
      });
      continue;
    }

    // Continuation and candidate decisions: the clock starts when the judgement
    // was made, so `action_at` is the anchor and no transaction is involved.
    if (row.instrument_id == null) {
      out.set(row.id, emptyReturns(row.decision_type, "no_instrument"));
      continue;
    }
    anchors.push({
      decisionId: row.id,
      decisionType: row.decision_type,
      instrumentId: row.instrument_id,
      kind: "decision",
      at: row.action_at,
      fillKind: null,
    });
  }

  if (anchors.length === 0) return out;

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

  const instrumentIds = [...new Set(anchors.map((row) => row.instrumentId))];
  if (spyId) instrumentIds.push(spyId);

  // The session the earliest anchor belongs to, by the same rule used to place
  // it, so the bar window cannot start after the anchor it has to price.
  const startDate = anchors.reduce(
    (min, row) => (fillSessionDate(row.at) < min ? fillSessionDate(row.at) : min),
    fillSessionDate(anchors[0]!.at),
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

  for (const anchor of anchors) {
    const session = anchorSession(anchor.at, tradingDays);
    if (session == null) {
      out.set(
        anchor.decisionId,
        emptyReturns(anchor.decisionType, "no_session"),
      );
      continue;
    }
    out.set(anchor.decisionId, {
      method: "close_to_close",
      decisionClass: decisionClass(anchor.decisionType),
      anchor: {
        kind: anchor.kind,
        at: anchor.at,
        session,
        fillKind: anchor.fillKind,
      },
      fill:
        anchor.kind === "fill" && anchor.fillKind != null
          ? {
              occurredAt: anchor.at,
              kind: anchor.fillKind,
              session,
            }
          : null,
      reason: null,
      horizons: decisionHorizonReturns({
        anchorSession: session,
        asOf,
        tickerBars: barsByInstrument.get(anchor.instrumentId) ?? [],
        spyBars: spyId ? (barsByInstrument.get(spyId) ?? []) : [],
      }),
    });
  }

  return out;
}
