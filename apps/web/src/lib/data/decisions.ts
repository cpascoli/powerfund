import { resolveDb, type DbClient } from "@/lib/supabase/db";

import { listInstrumentsWithThemes } from "@/lib/data/research";

export type DecisionRow = {
  id: string;
  instrument_id: string | null;
  decision_type:
    | "enter"
    | "add"
    | "reduce"
    | "exit"
    | "hold"
    | "watch";
  thesis: string;
  catalysts: string | null;
  risks: string | null;
  invalidation: string | null;
  sizing_rationale: string | null;
  action_at: string;
  outcome_notes: string | null;
  outcome_grade: string | null;
  reviewed_at: string | null;
  dossier_version_id: string | null;
  created_at: string;
};

export type DecisionListItem = DecisionRow & {
  symbol: string | null;
  instrument_name: string | null;
  dossier_version: { id: string; number: number } | null;
};

const DECISION_COLUMNS =
  "id, instrument_id, decision_type, thesis, catalysts, risks, invalidation, sizing_rationale, action_at, outcome_notes, outcome_grade, reviewed_at, dossier_version_id, created_at";

async function versionMap(
  supabase: DbClient,
  versionIds: string[],
): Promise<Map<string, { id: string; number: number }>> {
  const unique = [...new Set(versionIds)];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase
    .from("dossier_versions")
    .select("id, version_number")
    .in("id", unique);
  if (error) {
    throw new Error(`Failed to load dossier versions: ${error.message}`);
  }
  return new Map(
    (data ?? []).map((row) => [
      row.id,
      { id: row.id, number: row.version_number },
    ]),
  );
}

function attachVersion(
  decision: DecisionRow,
  versions: Map<string, { id: string; number: number }>,
  symbol: string | null,
  instrumentName: string | null,
): DecisionListItem {
  return {
    ...decision,
    symbol,
    instrument_name: instrumentName,
    dossier_version: decision.dossier_version_id
      ? (versions.get(decision.dossier_version_id) ?? {
          id: decision.dossier_version_id,
          number: 0,
        })
      : null,
  };
}

export async function listDecisions(
  client?: DbClient,
): Promise<DecisionListItem[]> {
  const supabase = await resolveDb(client);
  const [{ data, error }, instruments] = await Promise.all([
    supabase
      .from("decisions")
      .select(DECISION_COLUMNS)
      .order("action_at", { ascending: false }),
    listInstrumentsWithThemes(client),
  ]);

  if (error) {
    throw new Error(`Failed to load decisions: ${error.message}`);
  }

  const rows = (data as DecisionRow[] | null) ?? [];
  const versions = await versionMap(
    supabase,
    rows
      .map((row) => row.dossier_version_id)
      .filter((id): id is string => id != null),
  );
  const byId = new Map(instruments.map((row) => [row.id, row]));

  return rows.map((decision) => {
    const instrument = decision.instrument_id
      ? byId.get(decision.instrument_id)
      : undefined;
    return attachVersion(
      decision,
      versions,
      instrument?.symbol ?? null,
      instrument?.name ?? null,
    );
  });
}

export async function getDecision(
  id: string,
  client?: DbClient,
): Promise<DecisionListItem | null> {
  const supabase = await resolveDb(client);
  const { data, error } = await supabase
    .from("decisions")
    .select(DECISION_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load decision: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  const decision = data as DecisionRow;
  const versions = await versionMap(
    supabase,
    decision.dossier_version_id ? [decision.dossier_version_id] : [],
  );
  if (!decision.instrument_id) {
    return attachVersion(decision, versions, null, null);
  }

  const instruments = await listInstrumentsWithThemes(client);
  const instrument = instruments.find((row) => row.id === decision.instrument_id);

  return attachVersion(
    decision,
    versions,
    instrument?.symbol ?? null,
    instrument?.name ?? null,
  );
}
