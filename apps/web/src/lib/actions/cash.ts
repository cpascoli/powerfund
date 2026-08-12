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

export async function saveCash(
  _prev: CashActionState,
  formData: FormData,
): Promise<CashActionState> {
  const raw = emptyToNull(formData.get("cash"));
  const notes = emptyToNull(formData.get("notes"));
  const cash = raw == null ? NaN : Number(raw);

  if (!Number.isFinite(cash) || cash < 0) {
    return { error: "Cash must be a non-negative number.", ok: false };
  }

  const supabase = await createClient();
  const db = supabase as unknown as {
    from: (table: "portfolio_state") => {
      select: (columns: string) => {
        limit: (n: number) => {
          maybeSingle: () => Promise<{
            data: { id: string } | null;
            error: { message: string } | null;
          }>;
        };
      };
      insert: (
        values: Record<string, unknown>,
      ) => Promise<{ error: { message: string } | null }>;
      update: (values: Record<string, unknown>) => {
        eq: (
          column: "id",
          value: string,
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
  };

  const { data: existing, error: loadError } = await db
    .from("portfolio_state")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (loadError) {
    return { error: loadError.message, ok: false };
  }

  const { error } = existing
    ? await db
        .from("portfolio_state")
        .update({ cash, notes })
        .eq("id", existing.id)
    : await db.from("portfolio_state").insert({ cash, notes });

  if (error) {
    return { error: error.message, ok: false };
  }

  revalidatePath("/portfolio");
  revalidatePath("/");
  return { error: null, ok: true };
}
