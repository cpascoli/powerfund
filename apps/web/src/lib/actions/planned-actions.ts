"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Database } from "@powerfund/db";

import { bookFill } from "@/lib/actions/book-fill";
import { createClient } from "@/lib/supabase/server";

type PlannedActionInsert =
  Database["public"]["Tables"]["planned_actions"]["Insert"];
type PlannedActionType = Database["public"]["Enums"]["planned_action_type"];

export type PlannedActionState = {
  error: string | null;
};

function emptyToNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function parsePositiveNumber(raw: string | null): number | null {
  if (raw == null) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function revalidateBook() {
  revalidatePath("/portfolio");
  revalidatePath("/decisions");
  revalidatePath("/");
}

export async function savePlannedAction(
  _prev: PlannedActionState,
  formData: FormData,
): Promise<PlannedActionState> {
  const instrumentId = emptyToNull(formData.get("instrument_id"));
  const plannedUsd = parsePositiveNumber(emptyToNull(formData.get("planned_usd")));
  const windowLabel = emptyToNull(formData.get("window_label"));
  const dueBy = emptyToNull(formData.get("due_by"));
  const rationale = emptyToNull(formData.get("rationale"));
  const actionTypeRaw = emptyToNull(formData.get("action_type")) ?? "buy";
  const actionType: PlannedActionType = actionTypeRaw === "add" ? "add" : "buy";

  if (!instrumentId) {
    return { error: "Pick an instrument." };
  }
  if (plannedUsd == null) {
    return { error: "Planned amount must be a positive dollar amount." };
  }

  const supabase = await createClient();
  const planned: PlannedActionInsert = {
    instrument_id: instrumentId,
    action_type: actionType,
    planned_usd: plannedUsd,
    window_label: windowLabel,
    due_by: dueBy,
    rationale,
    status: "pending",
  };

  const { error } = await supabase.from("planned_actions").insert(planned);
  if (error) {
    return { error: error.message };
  }

  revalidateBook();
  redirect("/portfolio?tab=queue");
}

async function setStatus(
  id: string,
  status: "deferred" | "cancelled" | "pending",
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("planned_actions")
    .update({ status })
    .eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
  revalidateBook();
  redirect("/portfolio?tab=queue");
}

export async function deferPlannedAction(formData: FormData): Promise<void> {
  const id = emptyToNull(formData.get("id"));
  if (!id) return;
  await setStatus(id, "deferred");
}

export async function cancelPlannedAction(formData: FormData): Promise<void> {
  const id = emptyToNull(formData.get("id"));
  if (!id) return;
  await setStatus(id, "cancelled");
}

export async function restorePlannedAction(formData: FormData): Promise<void> {
  const id = emptyToNull(formData.get("id"));
  if (!id) return;
  await setStatus(id, "pending");
}

export async function confirmPlannedAction(
  _prev: PlannedActionState,
  formData: FormData,
): Promise<PlannedActionState> {
  const id = emptyToNull(formData.get("id"));
  const quantity = parsePositiveNumber(emptyToNull(formData.get("quantity")));
  const price = parsePositiveNumber(emptyToNull(formData.get("price")));
  const feesRaw = emptyToNull(formData.get("fees"));
  const filledAtRaw = emptyToNull(formData.get("filled_at"));
  const thesisSummary = emptyToNull(formData.get("thesis_summary"));
  const invalidation = emptyToNull(formData.get("invalidation"));

  if (!id) {
    return { error: "Missing planned action." };
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

  const filledAt = filledAtRaw
    ? new Date(filledAtRaw).toISOString()
    : new Date().toISOString();
  if (Number.isNaN(Date.parse(filledAt))) {
    return { error: "Invalid fill date." };
  }

  const supabase = await createClient();
  const { data: planned, error: loadError } = await supabase
    .from("planned_actions")
    .select("id, instrument_id, status, rationale")
    .eq("id", id)
    .maybeSingle();

  if (loadError) {
    return { error: loadError.message };
  }
  if (!planned) {
    return { error: "Planned action not found." };
  }

  // A unique index guarantees one ledger entry per planned action. Checking for it
  // first means a retry after a failed queue update repairs the queue instead of
  // booking the fill a second time.
  const { data: alreadyBooked } = await supabase
    .from("transactions")
    .select("id, decision_id, quantity, price")
    .eq("planned_action_id", id)
    .maybeSingle();

  if (alreadyBooked) {
    const { error: repairError } = await supabase
      .from("planned_actions")
      .update({ status: "confirmed" })
      .eq("id", id);
    if (repairError) {
      return {
        error: `This fill is already booked but the queue could not be updated: ${repairError.message}`,
      };
    }
    revalidateBook();
    redirect("/portfolio?tab=queue");
  }

  if (planned.status !== "pending" && planned.status !== "deferred") {
    return { error: "This action is no longer open." };
  }

  const result = await bookFill({
    instrumentId: planned.instrument_id,
    quantity,
    avgCost: price,
    openedAt: filledAt,
    thesisSummary: thesisSummary ?? planned.rationale,
    invalidation,
    logDecision: true,
    fees,
    plannedActionId: id,
  });

  if (!result.ok) {
    return { error: result.error };
  }

  const { error: updateError } = await supabase
    .from("planned_actions")
    .update({
      status: "confirmed",
      position_id: result.positionId,
      decision_id: result.decisionId,
      confirmed_quantity: quantity,
      confirmed_price: price,
      confirmed_at: filledAt,
    })
    .eq("id", id);

  if (updateError) {
    return {
      error:
        `Fill booked but the queue was not updated: ${updateError.message}. ` +
        "Confirming again is safe — it will only repair the queue.",
    };
  }

  revalidateBook();
  redirect("/portfolio?tab=book");
}
