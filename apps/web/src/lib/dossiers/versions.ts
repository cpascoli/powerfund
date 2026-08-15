import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@powerfund/db";
import type { DossierResearchLevel, DossierStatus } from "@powerfund/domain";

type DbClient = SupabaseClient<Database>;

export type DossierSnapshot = {
  status: DossierStatus;
  summary: string;
  thesis: string | null;
  catalysts: string | null;
  risks: string | null;
  invalidation: string | null;
  competitive_notes: string | null;
  next_diligence: string | null;
  source: string | null;
  research_level: DossierResearchLevel;
  as_of_at: string | null;
  verified_at: string | null;
  next_review_at: string | null;
};

export type JournalDossierFields = {
  catalysts: string | null;
  risks: string | null;
  invalidation: string | null;
  dossierVersionId: string | null;
};

const emptyJournalFields: JournalDossierFields = {
  catalysts: null,
  risks: null,
  invalidation: null,
  dossierVersionId: null,
};

export function assembleDossierSnapshot(row: DossierSnapshot): DossierSnapshot {
  return {
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
  };
}

export async function loadJournalDossierFields(
  supabase: DbClient,
  instrumentId: string,
): Promise<JournalDossierFields> {
  const { data: dossier, error: dossierError } = await supabase
    .from("dossiers")
    .select("id, catalysts, risks, invalidation")
    .eq("instrument_id", instrumentId)
    .maybeSingle();

  if (dossierError) {
    throw new Error(`Failed to load dossier: ${dossierError.message}`);
  }
  if (!dossier) {
    return emptyJournalFields;
  }

  const { data: version, error: versionError } = await supabase
    .from("dossier_versions")
    .select("id")
    .eq("dossier_id", dossier.id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (versionError) {
    throw new Error(`Failed to load dossier version: ${versionError.message}`);
  }

  return {
    catalysts: dossier.catalysts,
    risks: dossier.risks,
    invalidation: dossier.invalidation,
    dossierVersionId: version?.id ?? null,
  };
}

export async function recordDossierVersion(
  supabase: DbClient,
  dossierId: string,
  snapshot: DossierSnapshot,
  changeReason: string,
): Promise<string> {
  const { data: latest, error: latestError } = await supabase
    .from("dossier_versions")
    .select("id, version_number, snapshot")
    .eq("dossier_id", dossierId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    throw new Error(`Failed to load dossier versions: ${latestError.message}`);
  }

  if (
    latest &&
    JSON.stringify(latest.snapshot) === JSON.stringify(snapshot)
  ) {
    return latest.id;
  }

  const { data, error } = await supabase
    .from("dossier_versions")
    .insert({
      dossier_id: dossierId,
      version_number: (latest?.version_number ?? 0) + 1,
      snapshot: snapshot as unknown as Json,
      change_reason: changeReason,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to record dossier version: ${error?.message ?? "unknown error"}`,
    );
  }

  return data.id;
}
