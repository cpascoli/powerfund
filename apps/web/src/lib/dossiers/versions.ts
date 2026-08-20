import type { Json } from "@powerfund/db";
import type {
  DossierResearchLevel,
  DossierStatus,
} from "@powerfund/domain";

import type { DbClient } from "@/lib/supabase/db";

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

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortJson(record[key]);
        return acc;
      }, {});
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

export function snapshotsEqual(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

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

export async function loadCurrentDossierVersion(
  supabase: DbClient,
  dossierId: string,
): Promise<{ id: string; version_number: number } | null> {
  const { data, error } = await supabase
    .from("dossier_versions")
    .select("id, version_number")
    .eq("dossier_id", dossierId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load dossier version: ${error.message}`);
  }
  return data;
}

/**
 * Kept for callers that only need to snapshot after an already-written row.
 * Live dossier writes should go through `saveDossierVersioned` so the header
 * update and version insert stay in one transaction.
 */
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

  if (latest && snapshotsEqual(latest.snapshot, snapshot)) {
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
