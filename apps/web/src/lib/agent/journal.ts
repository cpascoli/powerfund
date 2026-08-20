import { DECISION_TYPES, type DecisionType } from "@powerfund/domain";

import { validationError } from "@/lib/api/agent/errors";
import { listDecisions, type DecisionListItem } from "@/lib/data/decisions";
import type { DbClient } from "@/lib/supabase/db";

export type JournalQuery = {
  symbol?: string;
  decision_type?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  before?: string;
};

function isDecisionType(value: string): value is DecisionType {
  return (DECISION_TYPES as readonly string[]).includes(value);
}

export function serializeDecision(row: DecisionListItem) {
  return {
    id: row.id,
    action_at: row.action_at,
    created_at: row.created_at,
    decision_type: row.decision_type,
    symbol: row.symbol,
    name: row.instrument_name,
    thesis: row.thesis,
    catalysts: row.catalysts,
    risks: row.risks,
    invalidation: row.invalidation,
    sizing_rationale: row.sizing_rationale,
    outcome_notes: row.outcome_notes,
    outcome_grade: row.outcome_grade,
    reviewed_at: row.reviewed_at,
    dossier_version: row.dossier_version,
  };
}

export async function getAgentJournal(supabase: DbClient, query: JournalQuery) {
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
  let rows = await listDecisions(supabase);

  if (query.symbol) {
    const symbol = query.symbol.trim().toUpperCase();
    rows = rows.filter((row) => row.symbol === symbol);
  }
  if (query.decision_type) {
    if (!isDecisionType(query.decision_type)) {
      throw validationError("Invalid decision_type.", {
        allowed: DECISION_TYPES,
      });
    }
    rows = rows.filter((row) => row.decision_type === query.decision_type);
  }
  if (query.date_from) {
    const from = Date.parse(query.date_from);
    if (Number.isNaN(from)) throw validationError("Invalid date_from.");
    rows = rows.filter((row) => Date.parse(row.action_at) >= from);
  }
  if (query.date_to) {
    const to = Date.parse(query.date_to);
    if (Number.isNaN(to)) throw validationError("Invalid date_to.");
    rows = rows.filter((row) => Date.parse(row.action_at) <= to);
  }
  if (query.before) {
    const before = Date.parse(query.before);
    if (Number.isNaN(before)) throw validationError("Invalid before cursor.");
    rows = rows.filter((row) => Date.parse(row.action_at) < before);
  }

  const sliced = rows.slice(0, limit);
  const next =
    sliced.length === limit ? sliced[sliced.length - 1]?.action_at ?? null : null;

  return {
    as_of: new Date().toISOString(),
    count: sliced.length,
    next_before: next,
    entries: sliced.map(serializeDecision),
  };
}
