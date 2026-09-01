import {
  DECISION_TYPES,
  type DecisionType,
} from "@powerfund/domain";

import { notFound, validationError } from "@/lib/api/agent/errors";
import { loadJournalDossierFields } from "@/lib/dossiers/versions";
import {
  copyEnterInvalidationToPosition,
  findOpenPositionId,
} from "@/lib/positions/copy-invalidation";
import type { DbClient } from "@/lib/supabase/db";

const MAX_TEXT = 50_000;

export type CreateDecisionInput = {
  symbol: string;
  decision_type: DecisionType;
  thesis: string;
  catalysts?: string | null;
  risks?: string | null;
  invalidation?: string | null;
  sizing_rationale?: string | null;
  action_at?: string | null;
  actor_name?: string | null;
};

export type CreatedDecision = {
  id: string;
  symbol: string;
  decision_type: DecisionType;
  thesis: string;
  catalysts: string | null;
  risks: string | null;
  invalidation: string | null;
  sizing_rationale: string | null;
  action_at: string;
  dossier_version: { id: string; number: number } | null;
};

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function assertText(name: string, value: string | null, required = false): string | null {
  if (value == null) {
    if (required) throw validationError(`${name} is required.`);
    return null;
  }
  if (value.length > MAX_TEXT) {
    throw validationError(`${name} must be at most ${MAX_TEXT} characters.`, {
      field: name,
    });
  }
  return value;
}

function isDecisionType(value: string): value is DecisionType {
  return (DECISION_TYPES as readonly string[]).includes(value);
}

async function loadInstrument(
  supabase: DbClient,
  symbol: string,
): Promise<{ id: string; symbol: string }> {
  const normalized = symbol.trim().toUpperCase();
  const { data, error } = await supabase
    .from("instruments")
    .select("id, symbol")
    .eq("symbol", normalized)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load instrument: ${error.message}`);
  }
  if (!data) {
    throw notFound("UNKNOWN_SYMBOL", `Unknown symbol: ${normalized}.`, {
      symbol: normalized,
    });
  }
  return data;
}

export async function createDecision(
  supabase: DbClient,
  input: CreateDecisionInput,
): Promise<CreatedDecision> {
  if (!isDecisionType(input.decision_type)) {
    throw validationError("Invalid decision type.", {
      decision_type: input.decision_type,
      allowed: DECISION_TYPES,
    });
  }
  const thesis = assertText("thesis", emptyToNull(input.thesis), true);
  if (!thesis) {
    throw validationError("Thesis is required.");
  }

  const actionAt = input.action_at
    ? new Date(input.action_at).toISOString()
    : new Date().toISOString();
  if (Number.isNaN(Date.parse(actionAt))) {
    throw validationError("Invalid action_at.");
  }

  const instrument = await loadInstrument(supabase, input.symbol);
  const dossier = await loadJournalDossierFields(supabase, instrument.id);

  let sizing = assertText(
    "sizing_rationale",
    emptyToNull(input.sizing_rationale),
  );
  const actor = emptyToNull(input.actor_name);
  if (actor) {
    const line = `[agent:${actor}]`;
    sizing = sizing ? `${line}\n${sizing}` : line;
  }

  const openPositionId =
    input.decision_type === "enter" || input.decision_type === "add"
      ? await findOpenPositionId(supabase, instrument.id)
      : null;

  const payload = {
    instrument_id: instrument.id,
    position_id: openPositionId,
    decision_type: input.decision_type,
    thesis,
    catalysts:
      assertText("catalysts", emptyToNull(input.catalysts)) ??
      dossier.catalysts,
    risks: assertText("risks", emptyToNull(input.risks)) ?? dossier.risks,
    invalidation:
      assertText("invalidation", emptyToNull(input.invalidation)) ??
      dossier.invalidation,
    sizing_rationale: sizing,
    action_at: actionAt,
    dossier_version_id: dossier.dossierVersionId,
  };

  const { data, error } = await supabase
    .from("decisions")
    .insert(payload)
    .select("id, dossier_version_id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Decision saved but no id returned.");
  }

  let version: CreatedDecision["dossier_version"] = null;
  if (data.dossier_version_id) {
    const { data: versionRow, error: versionError } = await supabase
      .from("dossier_versions")
      .select("id, version_number")
      .eq("id", data.dossier_version_id)
      .maybeSingle();
    if (versionError) {
      throw new Error(`Failed to load pinned version: ${versionError.message}`);
    }
    if (versionRow) {
      version = { id: versionRow.id, number: versionRow.version_number };
    }
  }

  await copyEnterInvalidationToPosition(supabase, {
    positionId: openPositionId,
    invalidation: payload.invalidation,
  });

  return {
    id: data.id,
    symbol: instrument.symbol,
    decision_type: input.decision_type,
    thesis,
    catalysts: payload.catalysts,
    risks: payload.risks,
    invalidation: payload.invalidation,
    sizing_rationale: payload.sizing_rationale,
    action_at: actionAt,
    dossier_version: version,
  };
}
