"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Database } from "@powerfund/db";
import { DECISION_TYPES, type DecisionType } from "@powerfund/domain";

import { AgentApiError } from "@/lib/api/agent/errors";
import { loadJournalDossierFields } from "@/lib/dossiers/versions";
import { createDecision } from "@/lib/journal/create-decision";
import { createClient } from "@/lib/supabase/server";

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

  if (id) {
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
    } satisfies DecisionUpdate;
    const { error } = await supabase
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

  if (!instrumentId) {
    return { error: "Pick an instrument." };
  }

  try {
    const { data: instrument } = await supabase
      .from("instruments")
      .select("symbol")
      .eq("id", instrumentId)
      .maybeSingle();
    if (!instrument) {
      return { error: "Unknown instrument." };
    }
    const created = await createDecision(supabase, {
      symbol: instrument.symbol,
      decision_type: decisionTypeRaw,
      thesis,
      catalysts: emptyToNull(formData.get("catalysts")),
      risks: emptyToNull(formData.get("risks")),
      invalidation: emptyToNull(formData.get("invalidation")),
      sizing_rationale: emptyToNull(formData.get("sizing_rationale")),
      action_at: actionAt,
    });
    revalidatePath("/decisions");
    revalidatePath(`/decisions/${created.id}`);
    redirect(`/decisions/${created.id}`);
  } catch (error) {
    if (error instanceof AgentApiError) {
      return { error: error.message };
    }
    return {
      error: error instanceof Error ? error.message : "Failed to save decision.",
    };
  }
}
