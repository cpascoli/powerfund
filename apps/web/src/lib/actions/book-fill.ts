"use server";

import type { Database } from "@powerfund/db";

import { createClient } from "@/lib/supabase/server";

type PositionInsert = Database["public"]["Tables"]["positions"]["Insert"];

export type BookFillResult =
  | {
      ok: true;
      positionId: string;
      decisionId: string | null;
      decisionType: "enter" | "add";
    }
  | { ok: false; error: string };

type OpenPositionRow = {
  id: string;
  quantity: number;
  avg_cost: number;
};

export async function bookFill(args: {
  instrumentId: string;
  quantity: number;
  avgCost: number;
  openedAt: string;
  thesisSummary: string | null;
  invalidation: string | null;
  logDecision: boolean;
}): Promise<BookFillResult> {
  const costBasis = args.quantity * args.avgCost;
  const supabase = await createClient();

  const positions = supabase as unknown as {
    from: (table: "positions") => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: string,
        ) => {
          eq: (
            column: string,
            value: string,
          ) => {
            limit: (n: number) => {
              maybeSingle: () => Promise<{
                data: OpenPositionRow | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
      insert: (values: PositionInsert) => {
        select: (columns: "id") => {
          single: () => Promise<{
            data: { id: string } | null;
            error: { message: string } | null;
          }>;
        };
      };
      update: (values: Record<string, unknown>) => {
        eq: (
          column: "id",
          value: string,
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
  const cashDb = supabase as unknown as {
    from: (table: "portfolio_state") => {
      select: (columns: "id, cash") => {
        limit: (n: number) => {
          maybeSingle: () => Promise<{
            data: { id: string; cash: number } | null;
            error: { message: string } | null;
          }>;
        };
      };
      update: (values: { cash: number }) => {
        eq: (
          column: "id",
          value: string,
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
  };

  const { data: state, error: stateError } = await cashDb
    .from("portfolio_state")
    .select("id, cash")
    .limit(1)
    .maybeSingle();

  if (stateError) {
    return { ok: false, error: `Failed to load cash: ${stateError.message}` };
  }
  if (!state) {
    return {
      ok: false,
      error: "Set cash first (Portfolio → Edit cash) before adding a fill.",
    };
  }
  if (Number(state.cash) < costBasis) {
    return {
      ok: false,
      error: `Not enough cash (${Number(state.cash).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
      })}) for this fill.`,
    };
  }

  const { data: existing, error: existingError } = await positions
    .from("positions")
    .select("id, quantity, avg_cost")
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

  let positionId: string;
  let decisionType: "enter" | "add";

  if (existing) {
    const oldQty = Number(existing.quantity);
    const oldAvg = Number(existing.avg_cost);
    const newQty = oldQty + args.quantity;
    const newAvg = (oldQty * oldAvg + costBasis) / newQty;
    const { error: updateError } = await positions
      .from("positions")
      .update({
        quantity: newQty,
        avg_cost: newAvg,
        thesis_summary: args.thesisSummary,
        invalidation: args.invalidation,
      })
      .eq("id", existing.id);
    if (updateError) {
      return { ok: false, error: updateError.message };
    }
    positionId = existing.id;
    decisionType = "add";
  } else {
    const payload = {
      instrument_id: args.instrumentId,
      status: "open",
      side: "long",
      quantity: args.quantity,
      avg_cost: args.avgCost,
      opened_at: args.openedAt,
      thesis_summary: args.thesisSummary,
      invalidation: args.invalidation,
    } satisfies PositionInsert;

    const { data, error } = await positions
      .from("positions")
      .insert(payload)
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Failed to save position." };
    }
    positionId = data.id;
    decisionType = "enter";
  }

  const { error: cashError } = await cashDb
    .from("portfolio_state")
    .update({ cash: Number(state.cash) - costBasis })
    .eq("id", state.id);
  if (cashError) {
    return {
      ok: false,
      error: `Position saved but cash was not updated: ${cashError.message}`,
    };
  }

  let decisionId: string | null = null;
  if (args.logDecision) {
    const decisions = supabase as unknown as {
      from: (table: "decisions") => {
        insert: (values: Record<string, unknown>) => {
          select: (columns: "id") => {
            single: () => Promise<{
              data: { id: string } | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
    const { data: decision, error: decisionError } = await decisions
      .from("decisions")
      .insert({
        instrument_id: args.instrumentId,
        position_id: positionId,
        decision_type: decisionType,
        thesis:
          args.thesisSummary ??
          `${decisionType === "add" ? "Added" : "Opened"} ${args.quantity} shares at $${args.avgCost.toFixed(2)}.`,
        sizing_rationale: `Cost basis ~$${costBasis.toFixed(2)}.`,
        invalidation: args.invalidation,
        action_at: args.openedAt,
      })
      .select("id")
      .single();
    if (!decisionError && decision) {
      decisionId = decision.id;
    }
  }

  return { ok: true, positionId, decisionId, decisionType };
}
