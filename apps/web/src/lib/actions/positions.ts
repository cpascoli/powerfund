"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Database } from "@powerfund/db";

import { createClient } from "@/lib/supabase/server";

type PositionInsert = Database["public"]["Tables"]["positions"]["Insert"];

export type PositionActionState = {
  error: string | null;
};

function emptyToNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function parsePositiveNumber(raw: string | null, label: string): number | null {
  if (raw == null) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  if (label === "quantity" && value === 0) return null;
  return value;
}

export async function savePosition(
  _prev: PositionActionState,
  formData: FormData,
): Promise<PositionActionState> {
  const instrumentId = emptyToNull(formData.get("instrument_id"));
  const quantity = parsePositiveNumber(
    emptyToNull(formData.get("quantity")),
    "quantity",
  );
  const avgCost = parsePositiveNumber(
    emptyToNull(formData.get("avg_cost")),
    "avg_cost",
  );
  const openedAtRaw = emptyToNull(formData.get("opened_at"));
  const thesisSummary = emptyToNull(formData.get("thesis_summary"));
  const invalidation = emptyToNull(formData.get("invalidation"));
  const alsoLogDecision = formData.get("log_decision") === "on";

  if (!instrumentId) {
    return { error: "Pick an instrument." };
  }
  if (quantity == null) {
    return { error: "Quantity must be a positive number." };
  }
  if (avgCost == null) {
    return { error: "Average cost must be a non-negative number." };
  }

  const openedAt = openedAtRaw
    ? new Date(openedAtRaw).toISOString()
    : new Date().toISOString();
  if (Number.isNaN(Date.parse(openedAt))) {
    return { error: "Invalid opened date." };
  }

  const costBasis = quantity * avgCost;
  const payload = {
    instrument_id: instrumentId,
    status: "open",
    side: "long",
    quantity,
    avg_cost: avgCost,
    opened_at: openedAt,
    thesis_summary: thesisSummary,
    invalidation,
  } satisfies PositionInsert;

  const supabase = await createClient();
  const positions = supabase as unknown as {
    from: (table: "positions") => {
      insert: (values: PositionInsert) => {
        select: (columns: "id") => {
          single: () => Promise<{
            data: { id: string } | null;
            error: { message: string } | null;
          }>;
        };
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
    return { error: `Failed to load cash: ${stateError.message}` };
  }
  if (!state) {
    return { error: "Set cash first (Portfolio → Edit cash) before adding a fill." };
  }
  if (Number(state.cash) < costBasis) {
    return {
      error: `Not enough cash (${Number(state.cash).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
      })}) for this fill.`,
    };
  }

  const { data, error } = await positions
    .from("positions")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Failed to save position." };
  }

  const { error: cashError } = await cashDb
    .from("portfolio_state")
    .update({ cash: Number(state.cash) - costBasis })
    .eq("id", state.id);
  if (cashError) {
    return {
      error: `Position saved but cash was not updated: ${cashError.message}`,
    };
  }

  if (alsoLogDecision) {
    const decisions = supabase as unknown as {
      from: (table: "decisions") => {
        insert: (values: Record<string, unknown>) => Promise<{
          error: { message: string } | null;
        }>;
      };
    };
    await decisions.from("decisions").insert({
      instrument_id: instrumentId,
      position_id: data.id,
      decision_type: "enter",
      thesis:
        thesisSummary ??
        `Opened long ${quantity} shares at $${avgCost.toFixed(2)} avg.`,
      sizing_rationale: `Cost basis ~$${costBasis.toFixed(2)}.`,
      invalidation,
      action_at: openedAt,
    });
  }

  revalidatePath("/portfolio");
  revalidatePath("/decisions");
  revalidatePath("/");
  redirect("/portfolio");
}
