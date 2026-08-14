"use server";

import { buyCashDelta } from "@powerfund/domain";
import type { Database } from "@powerfund/db";

import { mandateGate } from "@/lib/mandate/enforce";
import { createClient } from "@/lib/supabase/server";

type TransactionInsert = Database["public"]["Tables"]["transactions"]["Insert"];
type DecisionInsert = Database["public"]["Tables"]["decisions"]["Insert"];

export type BookFillResult =
  | {
      ok: true;
      positionId: string | null;
      decisionId: string | null;
      decisionType: "enter" | "add";
    }
  | { ok: false; error: string };

/**
 * Records a buy as a single ledger entry. A database trigger derives the cash
 * debit and the position from it in the same statement, so there is no window
 * in which one is written without the other.
 */
export async function bookFill(args: {
  instrumentId: string;
  quantity: number;
  avgCost: number;
  openedAt: string;
  thesisSummary: string | null;
  invalidation: string | null;
  logDecision: boolean;
  fees?: number;
  plannedActionId?: string | null;
  mandateOverrideReason?: string | null;
}): Promise<BookFillResult> {
  const fees = args.fees ?? 0;
  // Fees are capitalised into basis, so cash out is the whole cost.
  const cashDelta = buyCashDelta(args.quantity, args.avgCost, fees);
  const costBasis = -cashDelta;
  if (costBasis <= 0) {
    return { ok: false, error: "A fill must cost more than zero." };
  }

  const gate = await mandateGate({
    instrumentId: args.instrumentId,
    costUsd: costBasis,
    overrideReason: args.mandateOverrideReason ?? null,
  });
  if (!gate.ok) {
    return { ok: false, error: gate.error };
  }

  const supabase = await createClient();

  const { data: state, error: stateError } = await supabase
    .from("portfolio_state")
    .select("cash")
    .limit(1)
    .maybeSingle();

  if (stateError) {
    return { ok: false, error: `Failed to load cash: ${stateError.message}` };
  }
  if (!state) {
    return {
      ok: false,
      error: "Record a deposit first (Portfolio → Cash) before adding a fill.",
    };
  }
  // The `cash >= 0` constraint is the real backstop; this only gives a better message.
  if (Number(state.cash) < costBasis) {
    return {
      ok: false,
      error: `Not enough cash (${Number(state.cash).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
      })}) for this fill.`,
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from("positions")
    .select("id")
    .eq("instrument_id", args.instrumentId)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();

  if (existingError) {
    return {
      ok: false,
      error: `Failed to load position: ${existingError.message}`,
    };
  }

  const decisionType: "enter" | "add" = existing ? "add" : "enter";

  // The journal entry is written first so the ledger row can reference it, and
  // is cleaned up if the fill itself is rejected.
  let decisionId: string | null = null;
  if (args.logDecision) {
    const decision: DecisionInsert = {
      instrument_id: args.instrumentId,
      decision_type: decisionType,
      thesis:
        args.thesisSummary ??
        `${decisionType === "add" ? "Added" : "Opened"} ${args.quantity} shares at $${args.avgCost.toFixed(2)}.`,
      sizing_rationale: `Cost basis $${costBasis.toFixed(2)}.`,
      invalidation: args.invalidation,
      action_at: args.openedAt,
    };
    const { data, error } = await supabase
      .from("decisions")
      .insert(decision)
      .select("id")
      .single();
    if (error || !data) {
      return {
        ok: false,
        error: `Failed to log the decision: ${error?.message ?? "unknown error"}`,
      };
    }
    decisionId = data.id;
  }

  const entry: TransactionInsert = {
    occurred_at: args.openedAt,
    kind: "buy",
    instrument_id: args.instrumentId,
    quantity: args.quantity,
    price: args.avgCost,
    fees,
    cash_delta: cashDelta,
    decision_id: decisionId,
    planned_action_id: args.plannedActionId ?? null,
    mandate_override_reason:
      gate.violations.length > 0
        ? args.mandateOverrideReason?.trim() || null
        : null,
    notes: args.thesisSummary,
  };

  const { error: ledgerError } = await supabase
    .from("transactions")
    .insert(entry);

  if (ledgerError) {
    if (decisionId) {
      await supabase.from("decisions").delete().eq("id", decisionId);
    }
    return { ok: false, error: ledgerError.message };
  }

  // The trigger creates or updates the position, so read it back for the link.
  const { data: position } = await supabase
    .from("positions")
    .select("id")
    .eq("instrument_id", args.instrumentId)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();

  const positionId = position?.id ?? null;

  if (decisionId && positionId) {
    await supabase
      .from("decisions")
      .update({ position_id: positionId })
      .eq("id", decisionId);
  }

  return { ok: true, positionId, decisionId, decisionType };
}
