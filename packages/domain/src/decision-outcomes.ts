export type DecisionThesisGrade = "correct" | "partly_correct" | "wrong";

export const DECISION_THESIS_GRADES: readonly DecisionThesisGrade[] = [
  "correct",
  "partly_correct",
  "wrong",
] as const;

export type DecisionQualityGrade = "good" | "mixed" | "poor";

export const DECISION_QUALITY_GRADES: readonly DecisionQualityGrade[] = [
  "good",
  "mixed",
  "poor",
] as const;

export function isDecisionThesisGrade(
  value: string,
): value is DecisionThesisGrade {
  return (DECISION_THESIS_GRADES as readonly string[]).includes(value);
}

export function isDecisionQualityGrade(
  value: string,
): value is DecisionQualityGrade {
  return (DECISION_QUALITY_GRADES as readonly string[]).includes(value);
}
