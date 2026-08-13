"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type CashActionState = {
  error: string | null;
  ok: boolean;
};

function emptyToNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Cash is a projection of the transactions ledger, so it can no longer be set
 * by hand — that would leave the balance disagreeing with the entries that
 * explain it. Notes are still free-form. Deposits and withdrawals get their own
 * entry form (review BOOK-5); until then this refuses the edit rather than
 * silently desyncing the book.
 */
export async function saveCash(
  _prev: CashActionState,
  formData: FormData,
): Promise<CashActionState> {
  const raw = emptyToNull(formData.get("cash"));
  const notes = emptyToNull(formData.get("notes"));
  const submitted = raw == null ? null : Number(raw);

  const supabase = await createClient();
  const { data: existing, error: loadError } = await supabase
    .from("portfolio_state")
    .select("id, cash")
    .limit(1)
    .maybeSingle();

  if (loadError) {
    return { error: loadError.message, ok: false };
  }
  if (!existing) {
    return {
      error: "No book yet. Record a deposit to open the ledger.",
      ok: false,
    };
  }

  if (
    submitted != null &&
    Number.isFinite(submitted) &&
    Math.abs(submitted - Number(existing.cash)) >= 0.005
  ) {
    return {
      error:
        "Cash is derived from the transactions ledger and cannot be typed in. " +
        "Record a deposit or withdrawal so the balance has an entry explaining it.",
      ok: false,
    };
  }

  const { error } = await supabase
    .from("portfolio_state")
    .update({ notes })
    .eq("id", existing.id);

  if (error) {
    return { error: error.message, ok: false };
  }

  revalidatePath("/portfolio");
  revalidatePath("/");
  return { error: null, ok: true };
}
