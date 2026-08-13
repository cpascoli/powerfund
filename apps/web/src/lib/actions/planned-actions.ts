"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { bookFill } from "@/lib/actions/book-fill";
import { createClient } from "@/lib/supabase/server";

export type PlannedActionState = {
  error: string | null;
};

type PlannedActionType = "buy" | "add" | "reduce" | "sell";
type PlannedActionStatus = "pending" | "deferred" | "confirmed" | "cancelled";

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

function plannedDb() {
  return createClient().then((supabase) => {
    return supabase as unknown as {
      from: (table: "planned_actions") => {
        insert: (
          values: Record<string, unknown>,
        ) => Promise<{ error: { message: string } | null }>;
        update: (values: Record<string, unknown>) => {
          eq: (
            column: "id",
            value: string,
          ) => Promise<{ error: { message: string } | null }>;
        };
        select: (columns: string) => {
          eq: (
            column: string,
            value: string,
          ) => {
            maybeSingle: () => Promise<{
              data: {
                id: string;
                instrument_id: string;
                status: PlannedActionStatus;
                rationale: string | null;
              } | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  });
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
  const actionType: PlannedActionType =
    actionTypeRaw === "add" ? "add" : "buy";

  if (!instrumentId) {
    return { error: "Pick an instrument." };
  }
  if (plannedUsd == null) {
    return { error: "Planned amount must be a positive dollar amount." };
  }

  const db = await plannedDb();
  const { error } = await db.from("planned_actions").insert({
    instrument_id: instrumentId,
    action_type: actionType,
    planned_usd: plannedUsd,
    window_label: windowLabel,
    due_by: dueBy,
    rationale,
    status: "pending",
  });

  if (error) {
    return { error: error.message };
  }

  revalidateBook();
  redirect("/portfolio");
}

async function setStatus(
  id: string,
  status: "deferred" | "cancelled" | "pending",
): Promise<void> {
  const db = await plannedDb();
  const { error } = await db
    .from("planned_actions")
    .update({ status })
    .eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
  revalidateBook();
  redirect("/portfolio");
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

  const filledAt = filledAtRaw
    ? new Date(filledAtRaw).toISOString()
    : new Date().toISOString();
  if (Number.isNaN(Date.parse(filledAt))) {
    return { error: "Invalid fill date." };
  }

  const db = await plannedDb();
  const { data: planned, error: loadError } = await db
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
  });

  if (!result.ok) {
    return { error: result.error };
  }

  const { error: updateError } = await db
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
      error: `Fill booked but queue was not updated: ${updateError.message}`,
    };
  }

  revalidateBook();
  redirect("/portfolio");
}
