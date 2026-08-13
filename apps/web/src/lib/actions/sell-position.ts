"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sellCashDelta } from "@powerfund/domain";
import type { Database } from "@powerfund/db";

import { createClient } from "@/lib/supabase/server";

type TransactionInsert = Database["public"]["Tables"]["transactions"]["Insert"];
type DecisionInsert = Database["public"]["Tables"]["decisions"]["Insert"];

export type SellActionState = {
  error: string | null;
};

function emptyToNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function parsePositive(raw: string | null): number | null {
  if (raw == null) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

/**
 * Books a reduce or a full exit as one sell entry. The database reduces the
 * position, credits cash and computes realized P&L against the pooled average
 * cost, closing the position when the last unit goes.
 */
export async function sellPosition(
  _prev: SellActionState,
  formData: FormData,
): Promise<SellActionState> {
  const positionId = emptyToNull(formData.get("position_id"));
  const quantity = parsePositive(emptyToNull(formData.get("quantity")));
  const price = parsePositive(emptyToNull(formData.get("price")));
  const feesRaw = emptyToNull(formData.get("fees"));
  const soldAtRaw = emptyToNull(formData.get("sold_at"));
  const rationale = emptyToNull(formData.get("rationale"));
  const logDecision = formData.get("log_decision") === "on";

  if (!positionId) {
    return { error: "Missing position." };
  }
  if (quantity == null) {
    return { error: "Quantity must be a positive number." };
  }
  if (price == null) {
    return { error: "Price per share must be a positive number." };
  }

  const fees = feesRaw == null ? 0 : Number(feesRaw);
  if (!Number.isFinite(fees) || fees < 0) {
    return { error: "Fees must be zero or more." };
  }

  const soldAt = soldAtRaw
    ? new Date(soldAtRaw).toISOString()
    : new Date().toISOString();
  if (Number.isNaN(Date.parse(soldAt))) {
    return { error: "Invalid sell date." };
  }

  const supabase = await createClient();

  const { data: position, error: loadError } = await supabase
    .from("positions")
    .select("id, instrument_id, quantity, avg_cost, status")
    .eq("id", positionId)
    .maybeSingle();

  if (loadError) {
    return { error: `Failed to load position: ${loadError.message}` };
  }
  if (!position) {
    return { error: "Position not found." };
  }
  if (position.status !== "open") {
    return { error: "That position is already closed." };
  }

  const held = Number(position.quantity);
  if (quantity > held) {
    return {
      error: `Only ${held.toLocaleString(undefined, {
        maximumFractionDigits: 8,
      })} units are held.`,
    };
  }

  const proceeds = sellCashDelta(quantity, price, fees);
  if (proceeds <= 0) {
    return { error: "Fees cannot exceed the proceeds of the sale." };
  }

  const isFullExit = quantity === held;

  // Written first so the ledger entry can cite it, removed if the sale is rejected.
  let decisionId: string | null = null;
  if (logDecision) {
    const decision: DecisionInsert = {
      instrument_id: position.instrument_id,
      decision_type: isFullExit ? "exit" : "reduce",
      thesis:
        rationale ??
        `${isFullExit ? "Exited" : "Reduced"} ${quantity} units at $${price.toFixed(2)}.`,
      sizing_rationale: `Proceeds $${proceeds.toFixed(2)} against average cost $${Number(
        position.avg_cost,
      ).toFixed(2)}.`,
      action_at: soldAt,
      position_id: position.id,
    };
    const { data, error } = await supabase
      .from("decisions")
      .insert(decision)
      .select("id")
      .single();
    if (error || !data) {
      return {
        error: `Failed to log the decision: ${error?.message ?? "unknown error"}`,
      };
    }
    decisionId = data.id;
  }

  const entry: TransactionInsert = {
    occurred_at: soldAt,
    kind: "sell",
    instrument_id: position.instrument_id,
    quantity,
    price,
    fees,
    cash_delta: proceeds,
    decision_id: decisionId,
    notes: rationale,
  };

  const { error: ledgerError } = await supabase
    .from("transactions")
    .insert(entry);

  if (ledgerError) {
    if (decisionId) {
      await supabase.from("decisions").delete().eq("id", decisionId);
    }
    return { error: ledgerError.message };
  }

  revalidatePath("/portfolio");
  revalidatePath("/decisions");
  revalidatePath("/");
  redirect("/portfolio?tab=book");
}
