import {
  isDecisionQualityGrade,
  isDecisionThesisGrade,
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
  };

  const { data, error } = await supabase
    .from("decision_outcomes")
    .insert(payload)
    .select(
      "id, decision_id, recorded_at, thesis_grade, timing_grade, sizing_grade, risk_management_grade, lessons, actor_name",
    )
    .single();

  if (error || !data) {
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
  };
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
      "id, decision_id, recorded_at, thesis_grade, timing_grade, sizing_grade, risk_management_grade, lessons, actor_name",
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
    });
    out.set(row.decision_id, list);
  }
  return out;
}
