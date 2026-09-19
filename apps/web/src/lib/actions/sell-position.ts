"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sellCashDelta } from "@powerfund/domain";
import type { Database } from "@powerfund/db";

import { requireOperator } from "@/lib/auth/operator";
import { loadJournalDossierFields } from "@/lib/dossiers/versions";
import { createClient } from "@/lib/supabase/server";

type TransactionInsert = Database["public"]["Tables"]["transactions"]["Insert"];
type DecisionInsert = Database["public"]["Tables"]["decisions"]["Insert"];

export type SellActionState = {
  error: string | null;
};

export type BookSellResult =
  | {
      ok: true;
      positionId: string;
      decisionId: string | null;
      isFullExit: boolean;
    }
  | { ok: false; error: string };

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
 *
 * Addressable by position *or* by instrument, because the two callers know
 * different things: the sell form on Portfolio → Book has a position id, while a
 * queued `reduce`/`sell` carries only the instrument it was planned against.
 *
 * `plannedActionId` lands on the ledger row, which brings sells under the same
 * `transactions_planned_action_id_idx` unique index that has protected queued
 * buys since August. Without it a confirmed sale had no idempotency key at all:
 * a slow submit or a failed queue update could book the same exit twice, and
 * unlike a double buy there is no cash floor to stop it.
 */
export async function bookSell(args: {
  positionId?: string | null;
  instrumentId?: string | null;
  quantity: number;
  price: number;
  fees?: number;
  soldAt: string;
  rationale?: string | null;
  logDecision?: boolean;
  plannedActionId?: string | null;
}): Promise<BookSellResult> {
  const denied = await requireOperator();
  if (denied) return { ok: false, error: denied.error };

  const fees = args.fees ?? 0;
  if (!Number.isFinite(fees) || fees < 0) {
    return { ok: false, error: "Fees must be zero or more." };
  }

  const supabase = await createClient();

  // The position, by whichever handle the caller has. `status = open` on the
  // instrument lookup because a name can have been held, exited and re-entered.
  const query = supabase
    .from("positions")
    .select("id, instrument_id, quantity, avg_cost, status");
  const { data: position, error: loadError } = await (args.positionId
    ? query.eq("id", args.positionId).maybeSingle()
    : query
        .eq("instrument_id", args.instrumentId ?? "")
        .eq("status", "open")
        .limit(1)
        .maybeSingle());

  if (loadError) {
    return { ok: false, error: `Failed to load position: ${loadError.message}` };
  }
  if (!position) {
    return {
      ok: false,
      error: args.positionId
        ? "Position not found."
        : "No open position in this instrument, so there is nothing to sell.",
    };
  }
  if (position.status !== "open") {
    return { ok: false, error: "That position is already closed." };
  }

  const held = Number(position.quantity);
  if (args.quantity > held) {
    return {
      ok: false,
      error: `Only ${held.toLocaleString(undefined, {
        maximumFractionDigits: 8,
      })} units are held.`,
    };
  }

  const proceeds = sellCashDelta(args.quantity, args.price, fees);
  if (proceeds <= 0) {
    return { ok: false, error: "Fees cannot exceed the proceeds of the sale." };
  }

  const isFullExit = args.quantity === held;

  // Written first so the ledger entry can cite it, removed if the sale is rejected.
  let decisionId: string | null = null;
  if (args.logDecision) {
    const dossier = await loadJournalDossierFields(
      supabase,
      position.instrument_id,
    );
    const decision: DecisionInsert = {
      instrument_id: position.instrument_id,
      decision_type: isFullExit ? "exit" : "reduce",
      thesis:
        args.rationale ??
        `${isFullExit ? "Exited" : "Reduced"} ${args.quantity} units at $${args.price.toFixed(2)}.`,
      catalysts: dossier.catalysts,
      risks: dossier.risks,
      invalidation: dossier.invalidation,
      sizing_rationale: `Proceeds $${proceeds.toFixed(2)} against average cost $${Number(
        position.avg_cost,
      ).toFixed(2)}.`,
      dossier_version_id: dossier.dossierVersionId,
      action_at: args.soldAt,
      position_id: position.id,
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
    occurred_at: args.soldAt,
    kind: "sell",
    instrument_id: position.instrument_id,
    quantity: args.quantity,
    price: args.price,
    fees,
    cash_delta: proceeds,
    decision_id: decisionId,
    planned_action_id: args.plannedActionId ?? null,
    notes: args.rationale,
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

  return { ok: true, positionId: position.id, decisionId, isFullExit };
}

/** The sell form on Portfolio → Book. */
export async function sellPosition(
  _prev: SellActionState,
  formData: FormData,
): Promise<SellActionState> {
  const positionId = emptyToNull(formData.get("position_id"));
  const quantity = parsePositive(emptyToNull(formData.get("quantity")));
  const price = parsePositive(emptyToNull(formData.get("price")));
  const feesRaw = emptyToNull(formData.get("fees"));
  const soldAtRaw = emptyToNull(formData.get("sold_at"));

  if (!positionId) {
    return { error: "Missing position." };
  }
  if (quantity == null) {
    return { error: "Quantity must be a positive number." };
  }
  if (price == null) {
    return { error: "Price per share must be a positive number." };
  }

  const soldAt = soldAtRaw
    ? new Date(soldAtRaw).toISOString()
    : new Date().toISOString();
  if (Number.isNaN(Date.parse(soldAt))) {
    return { error: "Invalid sell date." };
  }

  const result = await bookSell({
    positionId,
    quantity,
    price,
    fees: feesRaw == null ? 0 : Number(feesRaw),
    soldAt,
    rationale: emptyToNull(formData.get("rationale")),
    logDecision: formData.get("log_decision") === "on",
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/portfolio");
  revalidatePath("/decisions");
  revalidatePath("/");
  redirect("/portfolio?tab=book");
}
