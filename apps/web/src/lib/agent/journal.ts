import {
  DECISION_TYPES,
  dueHorizonDays,
  fractionToPercent,
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
  freshnessPayload,
  loadSuccessBenchmarkThrough,
} from "@/lib/data/price-freshness";
import {
  gradedDecisionIds,
  listDecisionOutcomes,
  type RecordedDecisionOutcome,
} from "@/lib/journal/record-outcome";
import type { DbClient } from "@/lib/supabase/db";

export type JournalQuery = {
  symbol?: string;
  /** One type, or a comma-separated list — ritual 12 wants all four material types at once. */
  decision_type?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  before?: string;
  /** "false" for decisions with no outcome yet, "true" for ones already graded. */
  graded?: string;
  /**
   * "true" for decisions with an elapsed horizon carrying no grade written after
   * it. `graded=false` answers a different question: it drops a decision the
   * moment it is graded once, so a 30-day grade hides it until someone
   * remembers it at 90.
   */
  horizon_due?: string;
};

function isDecisionType(value: string): value is DecisionType {
  return (DECISION_TYPES as readonly string[]).includes(value);
}

/** The decision types ritual 12 calls material — the ones that moved money. */
export const MATERIAL_DECISION_TYPES: readonly DecisionType[] = [
  "enter",
  "add",
  "reduce",
  "exit",
];

function parseDecisionTypes(raw: string): DecisionType[] {
  const parts = raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) throw validationError("decision_type was empty.");
  const out: DecisionType[] = [];
  for (const part of parts) {
    // "material" is the set ritual 12 actually asks for; spelling it out every
    // time invites getting it wrong by omitting `reduce`.
    if (part === "material") {
      for (const type of MATERIAL_DECISION_TYPES) {
        if (!out.includes(type)) out.push(type);
      }
      continue;
    }
    if (!isDecisionType(part)) {
      throw validationError("Invalid decision_type.", {
        allowed: [...DECISION_TYPES, "material"],
      });
    }
    if (!out.includes(part)) out.push(part);
  }
  return out;
}

function parseGraded(
  raw: string | undefined,
  field = "graded",
): boolean | null {
  if (raw == null || raw.trim() === "") return null;
  const value = raw.trim().toLowerCase();
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw validationError(`${field} must be true or false.`);
}

function pctFromFraction(value: number | null): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return fractionToPercent(value);
}

function toAgentRelative(
  report: DecisionRelativeReturns,
  outcomes: RecordedDecisionOutcome[],
) {
  return {
    method: report.method,
    // Ritual 12 grades every eligible decision, so it needs to report the classes
    // separately: a run of weekly holds on one name is many judgements about one
    // position, not many observations of stock-picking skill.
    decision_class: report.decisionClass,
    anchor: report.anchor
      ? {
          kind: report.anchor.kind,
          at: report.anchor.at,
          session: report.anchor.session,
          fill_kind: report.anchor.fillKind,
        }
      : null,
    // Unchanged for fill-anchored decisions; null on a hold, which has no fill
    // rather than a fill that could not be found. Read `anchor` for the clock.
    fill: report.fill
      ? {
          occurred_at: report.fill.occurredAt,
          kind: report.fill.kind,
          session: report.fill.session,
        }
      : null,
    // The worklist, per decision: horizons that have elapsed and carry no grade
    // written after them. Empty means nothing is owed right now, not that the
    // decision is finished.
    due_horizons: dueHorizonDays({
      horizons: report.horizons,
      outcomeRecordedAt: outcomes.map((row) => row.recorded_at),
    }),
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
    relative_returns: relative ? toAgentRelative(relative, outcomes) : null,
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
    const types = parseDecisionTypes(query.decision_type);
    rows = rows.filter((row) => types.includes(row.decision_type));
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

  // Before the slice, or the filter would only describe the current page.
  const graded = parseGraded(query.graded);
  if (graded != null) {
    const gradedIds = await gradedDecisionIds(supabase);
    rows = rows.filter((row) => gradedIds.has(row.id) === graded);
  }

  const asOf = utcDay(new Date().toISOString());

  // Also before the slice, and it costs a returns pass over every matching row
  // rather than one page of them. Worth it: this is the question ritual 12 asks
  // to build its worklist, and an answer that only described the first page
  // would quietly shorten the list of what is owed.
  const horizonDue = parseGraded(query.horizon_due, "horizon_due");
  if (horizonDue != null) {
    const [allRelative, allOutcomes] = await Promise.all([
      loadDecisionRelativeReturns(supabase, rows, asOf),
      listDecisionOutcomes(
        supabase,
        rows.map((row) => row.id),
      ),
    ]);
    rows = rows.filter((row) => {
      const report = allRelative.get(row.id);
      const due =
        report == null
          ? []
          : dueHorizonDays({
              horizons: report.horizons,
              outcomeRecordedAt: (allOutcomes.get(row.id) ?? []).map(
                (outcome) => outcome.recorded_at,
              ),
            });
      return due.length > 0 === horizonDue;
    });
  }

  const sliced = rows.slice(0, limit);
  const next =
    sliced.length === limit ? sliced[sliced.length - 1]?.action_at ?? null : null;
  const [relative, outcomes, spyThrough] = await Promise.all([
    loadDecisionRelativeReturns(supabase, sliced, asOf),
    listDecisionOutcomes(
      supabase,
      sliced.map((row) => row.id),
    ),
    loadSuccessBenchmarkThrough(supabase),
  ]);
  let returnsThrough = spyThrough;
  for (const row of relative.values()) {
    for (const horizon of row.horizons) {
      if (returnsThrough == null || horizon.asOf > returnsThrough) {
        returnsThrough = horizon.asOf;
      }
    }
  }

  return {
    as_of: new Date().toISOString(),
    ...freshnessPayload(returnsThrough),
    count: sliced.length,
    next_before: next,
    notes: [
      "relative_returns are close-to-close percent from the anchor session. anchor.kind is 'fill' for enter/add/reduce/exit and 'decision' for hold/watch, which have no fill and start the clock at action_at. vs_spy_pct is ticker minus SPY. Horizons that have not elapsed still report so far.",
      "outcomes are append-only child rows. They do not set reviewed_at or complete a weekly hold — that is still a new createDecision.",
      "price_data_through is the last bar used for relative_returns. If price_data_stale is true, we are missing the last completed US cash session.",
      "graded=false lists decisions with no outcome yet. decision_type=material means enter, add, reduce and exit — the quarterly calibration set.",
      "horizon_due=true lists decisions with an elapsed horizon and no grade written after it, which is the grading worklist. graded=false only finds decisions never graded at all.",
      "decision_class separates position_originating (enter/add), continuation (hold), risk_changing (reduce/exit) and candidate (watch). Grade every class, but do not pool them: a run of weekly holds on one name is many judgements about one position.",
    ],
    entries: sliced.map((row) =>
      serializeDecision(row, relative.get(row.id), outcomes.get(row.id) ?? []),
    ),
  };
}
