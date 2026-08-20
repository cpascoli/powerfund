import type { Json } from "@powerfund/db";
import {
  DOSSIER_RESEARCH_LEVELS,
  DOSSIER_STATUSES,
  type DossierResearchLevel,
  type DossierStatus,
} from "@powerfund/domain";

import {
  AgentApiError,
  conflict,
  notFound,
  validationError,
} from "@/lib/api/agent/errors";
import type { DbClient } from "@/lib/supabase/db";

import {
  assembleDossierSnapshot,
  type DossierSnapshot,
} from "./versions";

const MAX_TEXT = 50_000;
const MAX_SOURCE = 100_000;
const MAX_REASON = 2_000;

export type DossierChanges = {
  status?: DossierStatus;
  research_level?: DossierResearchLevel;
  summary?: string;
  thesis?: string | null;
  catalysts?: string | null;
  risks?: string | null;
  invalidation?: string | null;
  competitive_notes?: string | null;
  next_diligence?: string | null;
  source?: string | null;
  as_of_at?: string | null;
  verified_at?: string | null;
  next_review_at?: string | null;
};

export type DossierActor = {
  actor?: string;
  actor_name?: string;
  research_sources?: string[];
};

export type UpdateDossierInput = {
  symbol: string;
  changes: DossierChanges;
  change_reason: string;
  expected_version?: number | null;
  actor?: DossierActor;
};

export type UpdateDossierResult = {
  symbol: string;
  changed: boolean;
  version: {
    id: string | null;
    number: number;
    change_reason?: string;
  };
};

type LiveDossierRow = DossierSnapshot & {
  id: string;
};

type RpcResult = {
  changed: boolean;
  dossier_id: string;
  version_id: string | null;
  version_number: number;
  change_reason?: string;
};

function isDossierStatus(value: string): value is DossierStatus {
  return (DOSSIER_STATUSES as readonly string[]).includes(value);
}

function isResearchLevel(value: string): value is DossierResearchLevel {
  return (DOSSIER_RESEARCH_LEVELS as readonly string[]).includes(value);
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function assertText(name: string, value: string | null, max: number): string | null {
  if (value == null) return null;
  if (value.length > max) {
    throw validationError(`${name} must be at most ${max} characters.`, {
      field: name,
      max,
    });
  }
  return value;
}

function normalizeTimestamp(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw validationError("Invalid timestamp.", { value });
  }
  return parsed.toISOString();
}

function dateOnlyToTimestamptz(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T00:00:00.000Z`;
  }
  return normalizeTimestamp(value);
}

export function formatChangeReason(
  reason: string,
  actor?: DossierActor,
): string {
  const sources = actor?.research_sources?.filter(
    (row) => typeof row === "string" && row.trim().length > 0,
  );
  const parts = [reason.trim()];
  const name = actor?.actor_name?.trim() || actor?.actor?.trim();
  if (name) {
    parts.unshift(`[agent:${name}]`);
  }
  if (sources && sources.length > 0) {
    parts.push(`Sources: ${sources.join(", ")}`);
  }
  return parts.join(" ").trim();
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

async function loadLiveDossier(
  supabase: DbClient,
  instrumentId: string,
): Promise<LiveDossierRow | null> {
  const { data, error } = await supabase
    .from("dossiers")
    .select(
      "id, status, summary, thesis, catalysts, risks, invalidation, competitive_notes, next_diligence, source, research_level, as_of_at, verified_at, next_review_at",
    )
    .eq("instrument_id", instrumentId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load dossier: ${error.message}`);
  }
  return data as LiveDossierRow | null;
}

function mergeDossier(
  current: LiveDossierRow | null,
  changes: DossierChanges,
): DossierSnapshot {
  const status = changes.status ?? current?.status ?? "watch";
  const researchLevel =
    changes.research_level ?? current?.research_level ?? "draft";
  const summary = assertText(
    "summary",
    emptyToNull(changes.summary ?? current?.summary ?? null),
    MAX_TEXT,
  );
  if (!summary) {
    throw validationError("Summary is required.");
  }
  if (!isDossierStatus(status)) {
    throw validationError("Invalid dossier status.", { status });
  }
  if (!isResearchLevel(researchLevel)) {
    throw validationError("Invalid research level.", { research_level: researchLevel });
  }

  const verifiedAtInput = dateOnlyToTimestamptz(
    changes.verified_at === undefined
      ? (current?.verified_at ?? null)
      : changes.verified_at,
  );
  const verifiedAt =
    verifiedAtInput ??
    (researchLevel === "primary_verified" || researchLevel === "investment_ready"
      ? new Date().toISOString()
      : null);

  return assembleDossierSnapshot({
    status,
    research_level: researchLevel,
    summary,
    thesis: assertText(
      "thesis",
      changes.thesis === undefined ? (current?.thesis ?? null) : emptyToNull(changes.thesis),
      MAX_TEXT,
    ),
    catalysts: assertText(
      "catalysts",
      changes.catalysts === undefined
        ? (current?.catalysts ?? null)
        : emptyToNull(changes.catalysts),
      MAX_TEXT,
    ),
    risks: assertText(
      "risks",
      changes.risks === undefined ? (current?.risks ?? null) : emptyToNull(changes.risks),
      MAX_TEXT,
    ),
    invalidation: assertText(
      "invalidation",
      changes.invalidation === undefined
        ? (current?.invalidation ?? null)
        : emptyToNull(changes.invalidation),
      MAX_TEXT,
    ),
    competitive_notes: assertText(
      "competitive_notes",
      changes.competitive_notes === undefined
        ? (current?.competitive_notes ?? null)
        : emptyToNull(changes.competitive_notes),
      MAX_TEXT,
    ),
    next_diligence: assertText(
      "next_diligence",
      changes.next_diligence === undefined
        ? (current?.next_diligence ?? null)
        : emptyToNull(changes.next_diligence),
      MAX_TEXT,
    ),
    source: assertText(
      "source",
      changes.source === undefined ? (current?.source ?? null) : emptyToNull(changes.source),
      MAX_SOURCE,
    ),
    as_of_at: dateOnlyToTimestamptz(
      changes.as_of_at === undefined ? (current?.as_of_at ?? null) : changes.as_of_at,
    ),
    verified_at: verifiedAt,
    next_review_at: dateOnlyToTimestamptz(
      changes.next_review_at === undefined
        ? (current?.next_review_at ?? null)
        : changes.next_review_at,
    ),
  });
}

function parseRpcError(error: { message: string; details?: string | null }): never {
  if (error.message.includes("DOSSIER_VERSION_CONFLICT")) {
    const current = Number(error.details);
    throw conflict(
      "DOSSIER_VERSION_CONFLICT",
      Number.isFinite(current)
        ? `Expected version does not match current version ${current}.`
        : "The dossier was updated concurrently. Reload and retry.",
      Number.isFinite(current) ? { current_version: current } : {},
    );
  }
  if (error.message.includes("UNKNOWN_INSTRUMENT")) {
    throw notFound("UNKNOWN_SYMBOL", "Unknown instrument.");
  }
  if (error.message.includes("VALIDATION_ERROR")) {
    throw validationError(error.message.replace(/^VALIDATION_ERROR:\s*/i, ""));
  }
  throw new AgentApiError(
    500,
    "DOSSIER_VERSIONING_FAILED",
    error.message || "Failed to save dossier version.",
  );
}

export async function saveDossierVersioned(
  supabase: DbClient,
  input: UpdateDossierInput & { instrumentId?: string },
): Promise<UpdateDossierResult> {
  const changeReason = assertText(
    "change_reason",
    emptyToNull(input.change_reason),
    MAX_REASON,
  );
  if (!changeReason) {
    throw validationError("change_reason is required.");
  }

  const instrument =
    input.instrumentId != null
      ? { id: input.instrumentId, symbol: input.symbol.toUpperCase() }
      : await loadInstrument(supabase, input.symbol);

  const current = await loadLiveDossier(supabase, instrument.id);
  const snapshot = mergeDossier(current, input.changes);
  const reason = formatChangeReason(changeReason, input.actor);
  const fields = { ...snapshot };

  const { data, error } = await supabase.rpc("save_dossier_versioned", {
    p_instrument_id: instrument.id,
    p_fields: fields as unknown as Json,
    p_snapshot: snapshot as unknown as Json,
    p_change_reason: reason,
    p_expected_version: input.expected_version ?? null,
  });

  if (error) {
    parseRpcError(error);
  }

  const result = data as RpcResult | null;
  if (!result) {
    throw new AgentApiError(
      500,
      "DOSSIER_VERSIONING_FAILED",
      "Dossier save returned no result.",
    );
  }

  return {
    symbol: instrument.symbol,
    changed: Boolean(result.changed),
    version: {
      id: result.version_id,
      number: Number(result.version_number),
      ...(result.changed && result.change_reason
        ? { change_reason: result.change_reason }
        : {}),
    },
  };
}

function asRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw validationError("Expected a string or null.");
  }
  return value;
}

const CHANGE_KEYS = [
  "status",
  "research_level",
  "summary",
  "thesis",
  "catalysts",
  "risks",
  "invalidation",
  "competitive_notes",
  "next_diligence",
  "source",
  "as_of_at",
  "verified_at",
  "next_review_at",
] as const;

export function parseDossierPatch(
  symbol: string,
  body: unknown,
  actorName?: string,
): UpdateDossierInput {
  if (!asRecord(body)) {
    throw validationError("Body must be a JSON object.");
  }
  if (!asRecord(body.changes)) {
    throw validationError("changes must be an object.");
  }

  const unknown = Object.keys(body.changes).filter(
    (key) => !(CHANGE_KEYS as readonly string[]).includes(key),
  );
  if (unknown.length > 0) {
    throw validationError("Unknown dossier fields.", { fields: unknown });
  }

  const changes: DossierChanges = {};
  for (const key of CHANGE_KEYS) {
    if (!(key in body.changes)) continue;
    const value = optionalString(body.changes[key]);
    if (key === "status" && value) {
      if (!isDossierStatus(value)) {
        throw validationError("Invalid dossier status.", { status: value });
      }
      changes.status = value;
      continue;
    }
    if (key === "research_level" && value) {
      if (!isResearchLevel(value)) {
        throw validationError("Invalid research level.", {
          research_level: value,
        });
      }
      changes.research_level = value;
      continue;
    }
    if (key === "summary" && value != null) {
      changes.summary = value;
      continue;
    }
    (changes as Record<string, string | null | undefined>)[key] = value ?? null;
  }

  const expected =
    body.expected_version === undefined || body.expected_version === null
      ? null
      : Number(body.expected_version);
  if (expected != null && (!Number.isInteger(expected) || expected < 0)) {
    throw validationError("expected_version must be a non-negative integer.");
  }

  const sources = Array.isArray(body.research_sources)
    ? body.research_sources.filter((row): row is string => typeof row === "string")
    : undefined;

  const changeReason = optionalString(body.change_reason);
  if (!changeReason) {
    throw validationError("change_reason is required.");
  }

  return {
    symbol,
    changes,
    change_reason: changeReason,
    expected_version: expected,
    actor: {
      actor: optionalString(body.actor) ?? "agent",
      actor_name: optionalString(body.actor_name) ?? actorName,
      research_sources: sources,
    },
  };
}
