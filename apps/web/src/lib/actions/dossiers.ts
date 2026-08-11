"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Database } from "@powerfund/db";
import { DOSSIER_STATUSES, type DossierStatus } from "@powerfund/domain";

import { createClient } from "@/lib/supabase/server";

type DossierInsert = Database["public"]["Tables"]["dossiers"]["Insert"];

export type DossierActionState = {
  error: string | null;
};

function emptyToNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function isDossierStatus(value: string): value is DossierStatus {
  return (DOSSIER_STATUSES as readonly string[]).includes(value);
}

export async function saveDossier(
  _prev: DossierActionState,
  formData: FormData,
): Promise<DossierActionState> {
  const instrumentId = String(formData.get("instrument_id") ?? "");
  const symbol = String(formData.get("symbol") ?? "").toUpperCase();
  const statusRaw = String(formData.get("status") ?? "watch");
  const summary = emptyToNull(formData.get("summary"));

  if (!instrumentId || !symbol) {
    return { error: "Missing instrument." };
  }
  if (!summary) {
    return { error: "Summary is required." };
  }
  if (!isDossierStatus(statusRaw)) {
    return { error: "Invalid dossier status." };
  }

  const payload = {
    instrument_id: instrumentId,
    status: statusRaw,
    summary,
    thesis: emptyToNull(formData.get("thesis")),
    catalysts: emptyToNull(formData.get("catalysts")),
    risks: emptyToNull(formData.get("risks")),
    invalidation: emptyToNull(formData.get("invalidation")),
    competitive_notes: emptyToNull(formData.get("competitive_notes")),
    next_diligence: emptyToNull(formData.get("next_diligence")),
    source: emptyToNull(formData.get("source")),
  } satisfies DossierInsert;

  const supabase = await createClient();
  // Database typings currently resolve mutation builders to `never`; runtime API is fine.
  const { error } = await (supabase as unknown as {
    from: (table: "dossiers") => {
      upsert: (
        values: DossierInsert,
        options: { onConflict: string },
      ) => Promise<{ error: { message: string } | null }>;
    };
  })
    .from("dossiers")
    .upsert(payload, { onConflict: "instrument_id" });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/explore");
  revalidatePath(`/explore/${symbol}`);
  revalidatePath("/themes");
  revalidatePath("/");
  redirect(`/explore/${symbol}`);
}
