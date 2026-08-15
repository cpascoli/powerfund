"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Database } from "@powerfund/db";
import { DECISION_TYPES, type DecisionType } from "@powerfund/domain";

import { loadJournalDossierFields } from "@/lib/dossiers/versions";
import { createClient } from "@/lib/supabase/server";

type DecisionInsert = Database["public"]["Tables"]["decisions"]["Insert"];
type DecisionUpdate = Database["public"]["Tables"]["decisions"]["Update"];

export type DecisionActionState = {
  error: string | null;
};

function emptyToNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function isDecisionType(value: string): value is DecisionType {
  return (DECISION_TYPES as readonly string[]).includes(value);
}

export async function saveDecision(
  _prev: DecisionActionState,
  formData: FormData,
): Promise<DecisionActionState> {
  const id = emptyToNull(formData.get("id"));
  const instrumentId = emptyToNull(formData.get("instrument_id"));
  const decisionTypeRaw = String(formData.get("decision_type") ?? "");
  const thesis = emptyToNull(formData.get("thesis"));
  const actionAtRaw = emptyToNull(formData.get("action_at"));

  if (!thesis) {
    return { error: "Thesis is required." };
  }
  if (!isDecisionType(decisionTypeRaw)) {
    return { error: "Invalid decision type." };
  }

  const actionAt = actionAtRaw
    ? new Date(actionAtRaw).toISOString()
    : new Date().toISOString();

  if (Number.isNaN(Date.parse(actionAt))) {
    return { error: "Invalid action date." };
  }

  const supabase = await createClient();
  const dossier = instrumentId
    ? await loadJournalDossierFields(supabase, instrumentId)
    : null;

  const payload = {
    instrument_id: instrumentId,
    decision_type: decisionTypeRaw,
    thesis,
    catalysts:
      emptyToNull(formData.get("catalysts")) ?? dossier?.catalysts ?? null,
    risks: emptyToNull(formData.get("risks")) ?? dossier?.risks ?? null,
    invalidation:
      emptyToNull(formData.get("invalidation")) ??
      dossier?.invalidation ??
      null,
    sizing_rationale: emptyToNull(formData.get("sizing_rationale")),
    action_at: actionAt,
    outcome_notes: emptyToNull(formData.get("outcome_notes")),
    outcome_grade: emptyToNull(formData.get("outcome_grade")),
    ...(id ? {} : { dossier_version_id: dossier?.dossierVersionId ?? null }),
  } satisfies DecisionInsert;
  // Database typings currently resolve mutation builders to `never`; runtime API is fine.
  const decisions = supabase as unknown as {
    from: (table: "decisions") => {
      update: (values: DecisionUpdate) => {
        eq: (
          column: "id",
          value: string,
        ) => Promise<{ error: { message: string } | null }>;
      };
      insert: (values: DecisionInsert) => {
        select: (columns: "id") => {
          single: () => Promise<{
            data: { id: string } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };

  if (id) {
    const { error } = await decisions
      .from("decisions")
      .update(payload)
      .eq("id", id);
    if (error) {
      return { error: error.message };
    }
    revalidatePath("/decisions");
    revalidatePath(`/decisions/${id}`);
    redirect(`/decisions/${id}`);
  }

  const { data, error } = await decisions
    .from("decisions")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  const newId = data?.id;
  if (!newId) {
    return { error: "Decision saved but no id returned." };
  }
  revalidatePath("/decisions");
  revalidatePath(`/decisions/${newId}`);
  redirect(`/decisions/${newId}`);
}
