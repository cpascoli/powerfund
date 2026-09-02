"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOperator } from "@/lib/auth/operator";
import { bookFill } from "@/lib/actions/book-fill";

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
  const denied = await requireOperator();
  if (denied) return { error: denied.error };

  const instrumentId = emptyToNull(formData.get("instrument_id"));
  const quantity = parsePositiveNumber(
    emptyToNull(formData.get("quantity")),
    "quantity",
  );
  const avgCost = parsePositiveNumber(
    emptyToNull(formData.get("avg_cost")),
    "avg_cost",
  );
  const feesRaw = emptyToNull(formData.get("fees"));
  const openedAtRaw = emptyToNull(formData.get("opened_at"));
  const thesisSummary = emptyToNull(formData.get("thesis_summary"));
  const invalidation = emptyToNull(formData.get("invalidation"));
  const alsoLogDecision = formData.get("log_decision") === "on";
  const mandateOverrideReason = emptyToNull(
    formData.get("mandate_override_reason"),
  );

  if (!instrumentId) {
    return { error: "Pick an instrument." };
  }
  if (quantity == null) {
    return { error: "Quantity must be a positive number." };
  }
  if (avgCost == null) {
    return { error: "Average cost must be a non-negative number." };
  }

  const fees = feesRaw == null ? 0 : Number(feesRaw);
  if (!Number.isFinite(fees) || fees < 0) {
    return { error: "Fees must be zero or more." };
  }

  const openedAt = openedAtRaw
    ? new Date(openedAtRaw).toISOString()
    : new Date().toISOString();
  if (Number.isNaN(Date.parse(openedAt))) {
    return { error: "Invalid opened date." };
  }

  const result = await bookFill({
    instrumentId,
    quantity,
    avgCost,
    openedAt,
    thesisSummary,
    invalidation,
    logDecision: alsoLogDecision,
    fees,
    mandateOverrideReason,
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/portfolio");
  revalidatePath("/decisions");
  revalidatePath("/");
  redirect("/portfolio?tab=book");
}
