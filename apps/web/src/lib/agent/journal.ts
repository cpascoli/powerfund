import {
  DECISION_TYPES,
  utcDay,
  type DecisionType,
} from "@powerfund/domain";

import { validationError } from "@/lib/api/agent/errors";
import {
  loadDecisionRelativeReturns,
  type DecisionRelativeReturns,
} from "@/lib/data/decision-returns";
import { listDecisions, type DecisionListItem } from "@/lib/data/decisions";
import {
  listDecisionOutcomes,
  type RecordedDecisionOutcome,
} from "@/lib/journal/record-outcome";
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

function pctFromFraction(value: number | null): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(value * 1000) / 10;
}

function toAgentRelative(report: DecisionRelativeReturns) {
  return {
    method: report.method,
    fill: report.fill
      ? {
          occurred_at: report.fill.occurredAt,
          kind: report.fill.kind,
          session: report.fill.session,
        }
      : null,
    reason: report.reason,
    horizons: report.horizons.map((row) => ({
      days: row.days,
      start: row.start,
      target: row.target,
      as_of: row.asOf,
      complete: row.complete,
      ticker_return_pct: pctFromFraction(row.tickerReturn),
      spy_return_pct: pctFromFraction(row.spyReturn),
      vs_spy_pct: pctFromFraction(row.vsSpy),
    })),
  };
}

function toAgentOutcome(row: RecordedDecisionOutcome) {
  return {
    id: row.id,
    recorded_at: row.recorded_at,
    thesis_grade: row.thesis_grade,
    timing_grade: row.timing_grade,
    sizing_grade: row.sizing_grade,
    risk_management_grade: row.risk_management_grade,
    lessons: row.lessons,
    actor_name: row.actor_name,
  };
}

export function serializeDecision(
  row: DecisionListItem,
  relative?: DecisionRelativeReturns,
  outcomes: RecordedDecisionOutcome[] = [],
) {
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
    relative_returns: relative ? toAgentRelative(relative) : null,
    outcomes: outcomes.map(toAgentOutcome),
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
  const asOf = utcDay(new Date().toISOString());
  const [relative, outcomes] = await Promise.all([
    loadDecisionRelativeReturns(supabase, sliced, asOf),
    listDecisionOutcomes(
      supabase,
      sliced.map((row) => row.id),
    ),
  ]);

  return {
    as_of: new Date().toISOString(),
    count: sliced.length,
    next_before: next,
    notes: [
      "relative_returns are close-to-close percent from the linked fill session, not action_at. vs_spy_pct is ticker minus SPY. Horizons that have not elapsed still report so far.",
      "outcomes are append-only child rows. They do not set reviewed_at or complete a weekly hold — that is still a new createDecision.",
    ],
    entries: sliced.map((row) =>
      serializeDecision(row, relative.get(row.id), outcomes.get(row.id) ?? []),
    ),
  };
}
