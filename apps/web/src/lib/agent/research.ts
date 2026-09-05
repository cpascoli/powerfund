import { validationError } from "@/lib/api/agent/errors";
import {
  buildResearchItems,
  isResearchKind,
  RESEARCH_KINDS,
  type ResearchItem,
  type ResearchKind,
} from "@/lib/data/briefing";
import { getOpenPortfolioBook } from "@/lib/data/portfolio";
import {
  listDossierReviews,
  listInstrumentsWithThemes,
} from "@/lib/data/research";
import type { DbClient } from "@/lib/supabase/db";

export type ResearchInboxFilter = {
  /** Empty means every kind. */
  kinds: ResearchKind[];
};

export type ResearchInboxItem = {
  kind: ResearchKind;
  symbol: string;
  name: string;
  next_review_at: string | null;
  next_diligence: string | null;
  updated_at: string | null;
  dossier_status: string | null;
  current_version_id: string | null;
  current_version_number: number | null;
  age_days: number | null;
  due_since: string | null;
  reason: string;
};

export function parseResearchInboxFilter(
  params: URLSearchParams,
): ResearchInboxFilter {
  const raw = params.get("kind")?.trim() ?? "";
  if (raw.length === 0) return { kinds: [] };
  const kinds: ResearchKind[] = [];
  for (const part of raw.split(",").map((row) => row.trim()).filter(Boolean)) {
    if (!isResearchKind(part)) {
      throw validationError(
        `Invalid kind: ${part}. Use one or more of ${RESEARCH_KINDS.join(", ")}.`,
      );
    }
    if (!kinds.includes(part)) kinds.push(part);
  }
  if (kinds.length === 0) {
    throw validationError("kind was empty after parsing.");
  }
  return { kinds };
}

export async function getResearchInbox(
  supabase: DbClient,
  filter: ResearchInboxFilter,
) {
  const asOf = new Date();
  const [instruments, dossiers, book] = await Promise.all([
    listInstrumentsWithThemes(supabase),
    listDossierReviews(supabase),
    getOpenPortfolioBook(supabase),
  ]);

  const derived = buildResearchItems({
    instruments,
    dossiers,
    book,
    today: asOf,
  });
  const items =
    filter.kinds.length === 0
      ? derived
      : derived.filter((row) => filter.kinds.includes(row.kind));

  const versions = await latestVersionsBySymbol(supabase, instruments);

  return {
    as_of: asOf.toISOString(),
    returned: items.length,
    items: items.map((row) => toInboxItem(row, versions.get(row.symbol) ?? null)),
  };
}

function toInboxItem(
  row: ResearchItem,
  version: { id: string; number: number } | null,
): ResearchInboxItem {
  return {
    kind: row.kind,
    symbol: row.symbol,
    name: row.name,
    next_review_at: row.nextReviewAt,
    next_diligence: row.nextDiligence,
    updated_at: row.updatedAt,
    dossier_status: row.dossierStatus,
    current_version_id: version?.id ?? null,
    current_version_number: version?.number ?? null,
    age_days: row.ageDays,
    due_since: row.dueSince,
    reason: row.detail,
  };
}

async function latestVersionsBySymbol(
  supabase: DbClient,
  instruments: Array<{ id: string; symbol: string }>,
): Promise<Map<string, { id: string; number: number }>> {
  const { data, error } = await supabase
    .from("dossiers")
    .select("id, instrument_id");
  if (error) {
    throw new Error(`Failed to load dossiers: ${error.message}`);
  }
  const rows = data ?? [];
  const dossierIds = rows.map((row) => row.id);
  const { data: versions, error: versionError } = dossierIds.length
    ? await supabase
        .from("dossier_versions")
        .select("id, dossier_id, version_number")
        .in("dossier_id", dossierIds)
        .order("version_number", { ascending: false })
    : {
        data: [] as Array<{
          id: string;
          dossier_id: string;
          version_number: number;
        }>,
        error: null,
      };
  if (versionError) {
    throw new Error(`Failed to load dossier versions: ${versionError.message}`);
  }

  const latestByDossier = new Map<string, { id: string; number: number }>();
  for (const version of versions ?? []) {
    if (!latestByDossier.has(version.dossier_id)) {
      latestByDossier.set(version.dossier_id, {
        id: version.id,
        number: version.version_number,
      });
    }
  }

  const symbolById = new Map(instruments.map((row) => [row.id, row.symbol]));
  const bySymbol = new Map<string, { id: string; number: number }>();
  for (const row of rows) {
    const symbol = symbolById.get(row.instrument_id);
    const latest = latestByDossier.get(row.id);
    if (symbol == null || latest == null) continue;
    bySymbol.set(symbol, latest);
  }
  return bySymbol;
}
