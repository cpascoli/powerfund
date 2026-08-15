"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Database } from "@powerfund/db";
import {
  DOSSIER_RESEARCH_LEVELS,
  DOSSIER_STATUSES,
  type DossierResearchLevel,
  type DossierStatus,
} from "@powerfund/domain";

import {
  assembleDossierSnapshot,
  recordDossierVersion,
} from "@/lib/dossiers/versions";
import { createClient } from "@/lib/supabase/server";

type DossierInsert = Database["public"]["Tables"]["dossiers"]["Insert"];
type DossierRow = Database["public"]["Tables"]["dossiers"]["Row"];

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

function dateToTimestamptz(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export async function saveDossier(
  _prev: DossierActionState,
  formData: FormData,
): Promise<DossierActionState> {
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

  const asOfAt = dateToTimestamptz(emptyToNull(formData.get("as_of_at")));
  const nextReviewAt = dateToTimestamptz(
    emptyToNull(formData.get("next_review_at")),
  );
  const verifiedAtInput = dateToTimestamptz(
    emptyToNull(formData.get("verified_at")),
  );
  const verifiedAt =
    verifiedAtInput ??
    (researchLevelRaw === "primary_verified" ||
    researchLevelRaw === "investment_ready"
      ? new Date().toISOString()
      : null);

  const payload = {
    instrument_id: instrumentId,
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
    as_of_at: asOfAt,
    verified_at: verifiedAt,
    next_review_at: nextReviewAt,
  } satisfies DossierInsert;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dossiers")
    .upsert(payload, { onConflict: "instrument_id" })
    .select(
      "id, status, summary, thesis, catalysts, risks, invalidation, competitive_notes, next_diligence, source, research_level, as_of_at, verified_at, next_review_at",
    )
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Dossier saved but no row returned." };
  }

  const row = data as DossierRow;
  try {
    await recordDossierVersion(
      supabase,
      row.id,
      assembleDossierSnapshot({
        status: row.status,
        summary: row.summary,
        thesis: row.thesis,
        catalysts: row.catalysts,
        risks: row.risks,
        invalidation: row.invalidation,
        competitive_notes: row.competitive_notes,
        next_diligence: row.next_diligence,
        source: row.source,
        research_level: row.research_level,
        as_of_at: row.as_of_at,
        verified_at: row.verified_at,
        next_review_at: row.next_review_at,
      }),
      emptyToNull(formData.get("change_reason")) ?? "dossier update",
    );
  } catch (versionError) {
    return {
      error:
        versionError instanceof Error
          ? versionError.message
          : "Failed to record dossier version.",
    };
  }

  revalidatePath("/explore");
  revalidatePath(`/explore/${symbol}`);
  revalidatePath("/themes");
  revalidatePath("/");
  redirect(`/explore/${symbol}`);
}
