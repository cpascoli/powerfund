import {
  DECISION_HORIZONS_DAYS,
  isDecisionHorizonDays,
  isDecisionQualityGrade,
  isDecisionThesisGrade,
  type DecisionHorizonDays,
  type DecisionQualityGrade,
  type DecisionThesisGrade,
} from "@powerfund/domain";

import { notFound, validationError } from "@/lib/api/agent/errors";
import type { DbClient } from "@/lib/supabase/db";

const MAX_TEXT = 50_000;

const FORBIDDEN_FIELDS = [
  "reviewed_at",
  "outcome_grade",
  "outcome_notes",
  "thesis",
  "decision_type",
  "action_at",
  "quantity",
  "price",
  "cash_delta",
  "transaction_id",
  "transactions",
] as const;

export type RecordDecisionOutcomeInput = {
  thesis_grade: string;
  timing_grade?: string | null;
  sizing_grade?: string | null;
  risk_management_grade?: string | null;
  lessons: string;
  actor_name?: string | null;
  /**
   * The horizon this grade is about, or an explicit null for an off-clock
   * observation. Required to be *present*: see parseHorizonDays.
   */
  horizon_days: number | string | null | undefined;
};

export type RecordedDecisionOutcome = {
  id: string;
  decision_id: string;
  recorded_at: string;
  thesis_grade: DecisionThesisGrade;
  timing_grade: DecisionQualityGrade | null;
  sizing_grade: DecisionQualityGrade | null;
  risk_management_grade: DecisionQualityGrade | null;
  lessons: string;
  actor_name: string | null;
  horizon_days: DecisionHorizonDays | null;
};

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function assertNotDecisionPatch(body: unknown): void {
  if (!body || typeof body !== "object") return;
  const record = body as Record<string, unknown>;
  const present = FORBIDDEN_FIELDS.filter((key) => key in record);
  if (present.length > 0) {
    throw validationError(
      "recordDecisionOutcome cannot patch the original journal row or book a fill. Weekly holds still need a new createDecision.",
      { rejected_fields: present },
    );
  }
}

function parseQuality(
  name: string,
  value: string | null | undefined,
): DecisionQualityGrade | null {
  const trimmed = emptyToNull(value);
  if (trimmed == null) return null;
  if (!isDecisionQualityGrade(trimmed)) {
    throw validationError(`Invalid ${name}.`, {
      field: name,
      allowed: ["good", "mixed", "poor"],
    });
  }
  return trimmed;
}

/**
 * Present, not merely valid. An omitted horizon used to mean null, which is the
 * one mistake this field exists to prevent: a caller that forgets it writes an
 * off-clock observation while believing it recorded the 30-day grade, the
 * horizon stays owed, and the grade it thought it wrote is not the grade that
 * exists. Making omission an error costs one line and turns a silent
 * misclassification into a 422. An explicit null still means off-clock.
 */
function parseHorizonDays(
  value: number | string | null | undefined,
): DecisionHorizonDays | null {
  if (value === undefined) {
    throw validationError(
      "horizon_days is required. Pass 30, 90 or 180 for a clocked calibration grade, or null for an off-clock observation.",
      { field: "horizon_days", allowed: [...DECISION_HORIZONS_DAYS, null] },
    );
  }
  if (value === null || value === "") return null;
  const days = typeof value === "number" ? value : Number(value.trim());
  if (!Number.isInteger(days) || !isDecisionHorizonDays(days)) {
    throw validationError("Invalid horizon_days.", {
      field: "horizon_days",
      allowed: DECISION_HORIZONS_DAYS,
    });
  }
  return days;
}

/**
 * The stored column is a smallint, so the database's own check constraint is the
 * guarantee and this only narrows the type back. Anything outside the allowed set
 * reads as an off-clock observation rather than throwing on read.
 */
function narrowHorizonDays(value: number | null): DecisionHorizonDays | null {
  if (value == null) return null;
  return isDecisionHorizonDays(value) ? value : null;
}

export async function recordDecisionOutcome(
  supabase: DbClient,
  decisionId: string,
  input: RecordDecisionOutcomeInput,
): Promise<RecordedDecisionOutcome> {
  const thesisGrade = emptyToNull(input.thesis_grade);
  if (thesisGrade == null || !isDecisionThesisGrade(thesisGrade)) {
    throw validationError("Invalid thesis_grade.", {
      field: "thesis_grade",
      allowed: ["correct", "partly_correct", "wrong"],
    });
  }
  const lessons = emptyToNull(input.lessons);
  if (lessons == null) {
    throw validationError("lessons is required.");
  }
  if (lessons.length > MAX_TEXT) {
    throw validationError(`lessons must be at most ${MAX_TEXT} characters.`, {
      field: "lessons",
    });
  }

  const { data: decision, error: decisionError } = await supabase
    .from("decisions")
    .select("id")
    .eq("id", decisionId)
    .maybeSingle();
  if (decisionError) {
    throw new Error(`Failed to load decision: ${decisionError.message}`);
  }
  if (!decision) {
    throw notFound("UNKNOWN_DECISION", "Unknown decision.", { id: decisionId });
  }

  const payload = {
    decision_id: decisionId,
    thesis_grade: thesisGrade,
    timing_grade: parseQuality("timing_grade", input.timing_grade),
    sizing_grade: parseQuality("sizing_grade", input.sizing_grade),
    risk_management_grade: parseQuality(
      "risk_management_grade",
      input.risk_management_grade,
    ),
    lessons,
    actor_name: emptyToNull(input.actor_name),
    horizon_days: parseHorizonDays(input.horizon_days),
  };

  const { data, error } = await supabase
    .from("decision_outcomes")
    .insert(payload)
    .select(
      "id, decision_id, recorded_at, thesis_grade, timing_grade, sizing_grade, risk_management_grade, lessons, actor_name, horizon_days",
    )
    .single();

  if (error || !data) {
    // A unique violation here is the clock working, not a fault: this horizon
    // already carries a grade, and the table is append-only precisely so an
    // earlier judgement cannot be revised once later information exists.
    if (error?.code === "23505") {
      throw validationError(
        `This decision already has a ${payload.horizon_days}-day grade. Grades are append-only, so an earlier horizon cannot be rewritten once it is recorded.`,
        { field: "horizon_days", code: "HORIZON_ALREADY_GRADED" },
      );
    }
    throw new Error(error?.message ?? "Outcome saved but no id returned.");
  }

  return {
    id: data.id,
    decision_id: data.decision_id,
    recorded_at: data.recorded_at,
    thesis_grade: data.thesis_grade,
    timing_grade: data.timing_grade,
    sizing_grade: data.sizing_grade,
    risk_management_grade: data.risk_management_grade,
    lessons: data.lessons,
    actor_name: data.actor_name,
    horizon_days: narrowHorizonDays(data.horizon_days),
  };
}

const OUTCOME_PAGE = 1000;

/**
 * The ids of every decision that has been graded at least once.
 *
 * Ritual 12 asks "which material decisions have not been calibrated yet", and
 * that question cannot be answered by looking at a page of the journal: the
 * absence of a child row is not a column you can filter on. Reading the whole
 * (small, append-only) table once and filtering in memory is cheaper than a
 * correlated per-decision existence check, and it must happen *before* the
 * journal is paged or the filter would only apply to the current page.
 *
 * Paged, because PostgREST caps a response at 1,000 rows and says nothing
 * about it.
 */
export async function gradedDecisionIds(
  supabase: DbClient,
): Promise<Set<string>> {
  const graded = new Set<string>();
  for (let offset = 0; ; offset += OUTCOME_PAGE) {
    const { data, error } = await supabase
      .from("decision_outcomes")
      .select("decision_id")
      .range(offset, offset + OUTCOME_PAGE - 1);
    if (error) {
      throw new Error(`Failed to load decision outcomes: ${error.message}`);
    }
    const page = (data as Array<{ decision_id: string }> | null) ?? [];
    for (const row of page) graded.add(row.decision_id);
    if (page.length < OUTCOME_PAGE) return graded;
  }
}

export async function listDecisionOutcomes(
  supabase: DbClient,
  decisionIds: string[],
): Promise<Map<string, RecordedDecisionOutcome[]>> {
  const out = new Map<string, RecordedDecisionOutcome[]>();
  if (decisionIds.length === 0) return out;
  const { data, error } = await supabase
    .from("decision_outcomes")
    .select(
      "id, decision_id, recorded_at, thesis_grade, timing_grade, sizing_grade, risk_management_grade, lessons, actor_name, horizon_days",
    )
    .in("decision_id", decisionIds)
    .order("recorded_at", { ascending: false });
  if (error) {
    throw new Error(`Failed to load decision outcomes: ${error.message}`);
  }
  for (const row of data ?? []) {
    const list = out.get(row.decision_id) ?? [];
    list.push({
      id: row.id,
      decision_id: row.decision_id,
      recorded_at: row.recorded_at,
      thesis_grade: row.thesis_grade,
      timing_grade: row.timing_grade,
      sizing_grade: row.sizing_grade,
      risk_management_grade: row.risk_management_grade,
      lessons: row.lessons,
      actor_name: row.actor_name,
      horizon_days: narrowHorizonDays(row.horizon_days),
    });
    out.set(row.decision_id, list);
  }
  return out;
}
