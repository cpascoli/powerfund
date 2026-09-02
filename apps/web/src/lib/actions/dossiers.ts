"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  DOSSIER_RESEARCH_LEVELS,
  DOSSIER_STATUSES,
  type DossierResearchLevel,
  type DossierStatus,
} from "@powerfund/domain";

import { AgentApiError } from "@/lib/api/agent/errors";
import { requireOperator } from "@/lib/auth/operator";
import { saveDossierVersioned } from "@/lib/dossiers/save";
import { createClient } from "@/lib/supabase/server";

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

function isResearchLevel(value: string): value is DossierResearchLevel {
  return (DOSSIER_RESEARCH_LEVELS as readonly string[]).includes(value);
}

export async function saveDossier(
  _prev: DossierActionState,
  formData: FormData,
): Promise<DossierActionState> {
  const denied = await requireOperator();
  if (denied) return { error: denied.error };

  const instrumentId = String(formData.get("instrument_id") ?? "");
  const symbol = String(formData.get("symbol") ?? "").toUpperCase();
  const statusRaw = String(formData.get("status") ?? "watch");
  const researchLevelRaw = String(formData.get("research_level") ?? "draft");
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
  if (!isResearchLevel(researchLevelRaw)) {
    return { error: "Invalid research level." };
  }

  const supabase = await createClient();
  try {
    await saveDossierVersioned(supabase, {
      symbol,
      instrumentId,
      change_reason: emptyToNull(formData.get("change_reason")) ?? "dossier update",
      changes: {
        status: statusRaw,
        research_level: researchLevelRaw,
        summary,
        thesis: emptyToNull(formData.get("thesis")),
        catalysts: emptyToNull(formData.get("catalysts")),
        risks: emptyToNull(formData.get("risks")),
        invalidation: emptyToNull(formData.get("invalidation")),
        competitive_notes: emptyToNull(formData.get("competitive_notes")),
        next_diligence: emptyToNull(formData.get("next_diligence")),
        source: emptyToNull(formData.get("source")),
        as_of_at: emptyToNull(formData.get("as_of_at")),
        verified_at: emptyToNull(formData.get("verified_at")),
        next_review_at: emptyToNull(formData.get("next_review_at")),
      },
    });
  } catch (error) {
    if (error instanceof AgentApiError) {
      return { error: error.message };
    }
    return {
      error: error instanceof Error ? error.message : "Failed to save dossier.",
    };
  }

  revalidatePath("/explore");
  revalidatePath(`/explore/${symbol}`);
  revalidatePath("/");
  redirect(`/explore/${symbol}`);
}
