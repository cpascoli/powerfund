export type ReviewTaskStatus =
  | "pending"
  | "due"
  | "in_progress"
  | "completed"
  | "deferred"
  | "cancelled";

export const REVIEW_TASK_STATUSES: readonly ReviewTaskStatus[] = [
  "pending",
  "due",
  "in_progress",
  "completed",
  "deferred",
  "cancelled",
] as const;

export const OPEN_REVIEW_TASK_STATUSES: readonly ReviewTaskStatus[] = [
  "pending",
  "due",
  "in_progress",
  "deferred",
] as const;

export const PATCHABLE_REVIEW_TASK_STATUSES: readonly ReviewTaskStatus[] = [
  "pending",
  "in_progress",
  "deferred",
  "cancelled",
] as const;

export type ReviewTaskScope = "company" | "theme" | "portfolio" | "macro";

export const REVIEW_TASK_SCOPES: readonly ReviewTaskScope[] = [
  "company",
  "theme",
  "portfolio",
  "macro",
] as const;

export type ReviewTaskPriority = "low" | "normal" | "high" | "urgent";

export const REVIEW_TASK_PRIORITIES: readonly ReviewTaskPriority[] = [
  "low",
  "normal",
  "high",
  "urgent",
] as const;

export type ReviewOutputKind =
  | "dossier_version"
  | "decision"
  | "planned_action";

export const REVIEW_OUTPUT_KINDS: readonly ReviewOutputKind[] = [
  "dossier_version",
  "decision",
  "planned_action",
] as const;

export type ConditionOperator = "lt" | "lte" | "gt" | "gte" | "eq";

export const CONDITION_OPERATORS: readonly ConditionOperator[] = [
  "lt",
  "lte",
  "gt",
  "gte",
  "eq",
] as const;

export type EvaluableConditionMetric = "price" | "price_return_pct";

export const EVALUABLE_CONDITION_METRICS: readonly EvaluableConditionMetric[] =
  ["price", "price_return_pct"] as const;

export type ScheduledReviewTrigger = {
  type: "scheduled";
  at: string;
};

export type EventWindowReviewTrigger = {
  type: "event_window";
  not_before: string;
  due_by: string;
};

export type ConditionReviewTrigger = {
  type: "condition";
  metric: string;
  symbol: string;
  operator: ConditionOperator;
  value: number;
  lookback_days?: number;
};

export type ReviewTrigger =
  | ScheduledReviewTrigger
  | EventWindowReviewTrigger
  | ConditionReviewTrigger;

export type ReviewTriggerSchedule = {
  scheduled_for: string | null;
  not_before: string | null;
  due_by: string | null;
};

export type MarketObservation = {
  lastPrice: Record<string, number | null>;
  returnPct: Record<string, number | null>;
};

export type ReviewTriggerTask = {
  id: string;
  status: ReviewTaskStatus;
  trigger: ReviewTrigger;
};

export type TriggerEvaluation = {
  taskId: string;
  satisfied: boolean;
  evaluable: boolean;
  reason: string;
};

export class ReviewTriggerParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewTriggerParseError";
  }
}

const EVALUABLE_METRIC_SET = new Set<string>(EVALUABLE_CONDITION_METRICS);
const OPERATOR_SET = new Set<string>(CONDITION_OPERATORS);

function asRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseInstant(value: unknown, field: string): Date {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ReviewTriggerParseError(`${field} must be an ISO timestamp.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ReviewTriggerParseError(`${field} must be an ISO timestamp.`);
  }
  return date;
}

function iso(date: Date): string {
  return date.toISOString();
}

export function isReviewTaskStatus(value: string): value is ReviewTaskStatus {
  return (REVIEW_TASK_STATUSES as readonly string[]).includes(value);
}

export function isReviewTaskScope(value: string): value is ReviewTaskScope {
  return (REVIEW_TASK_SCOPES as readonly string[]).includes(value);
}

export function isReviewTaskPriority(
  value: string,
): value is ReviewTaskPriority {
  return (REVIEW_TASK_PRIORITIES as readonly string[]).includes(value);
}

export function isReviewOutputKind(value: string): value is ReviewOutputKind {
  return (REVIEW_OUTPUT_KINDS as readonly string[]).includes(value);
}

export function isConditionMetricEvaluable(
  metric: string,
): metric is EvaluableConditionMetric {
  return EVALUABLE_METRIC_SET.has(metric);
}

export function returnPctKey(symbol: string, lookbackDays: number): string {
  return `${symbol.toUpperCase()}:${lookbackDays}`;
}

export function parseReviewTrigger(value: unknown): ReviewTrigger {
  if (!asRecord(value) || typeof value.type !== "string") {
    throw new ReviewTriggerParseError(
      "trigger must be an object with a type of scheduled, event_window, or condition.",
    );
  }

  switch (value.type) {
    case "scheduled": {
      const at = iso(parseInstant(value.at, "trigger.at"));
      return { type: "scheduled", at };
    }
    case "event_window": {
      const notBefore = parseInstant(value.not_before, "trigger.not_before");
      const dueBy = parseInstant(value.due_by, "trigger.due_by");
      if (dueBy.getTime() <= notBefore.getTime()) {
        throw new ReviewTriggerParseError(
          "trigger.due_by must be after trigger.not_before.",
        );
      }
      return {
        type: "event_window",
        not_before: iso(notBefore),
        due_by: iso(dueBy),
      };
    }
    case "condition": {
      const metric =
        typeof value.metric === "string" ? value.metric.trim().toLowerCase() : "";
      if (!/^[a-z][a-z0-9_]{0,63}$/.test(metric)) {
        throw new ReviewTriggerParseError(
          "trigger.metric must be a lowercase identifier.",
        );
      }
      const symbol =
        typeof value.symbol === "string" ? value.symbol.trim().toUpperCase() : "";
      if (!/^[A-Z0-9.]{1,16}$/.test(symbol)) {
        throw new ReviewTriggerParseError("trigger.symbol is required.");
      }
      const operator =
        typeof value.operator === "string" ? value.operator.trim() : "";
      if (!OPERATOR_SET.has(operator)) {
        throw new ReviewTriggerParseError(
          "trigger.operator must be lt, lte, gt, gte, or eq.",
        );
      }
      if (typeof value.value !== "number" || !Number.isFinite(value.value)) {
        throw new ReviewTriggerParseError("trigger.value must be a finite number.");
      }
      let lookbackDays: number | undefined;
      if (value.lookback_days != null) {
        if (
          typeof value.lookback_days !== "number" ||
          !Number.isInteger(value.lookback_days) ||
          value.lookback_days < 1
        ) {
          throw new ReviewTriggerParseError(
            "trigger.lookback_days must be a positive integer.",
          );
        }
        lookbackDays = value.lookback_days;
      }
      if (metric === "price_return_pct" && lookbackDays == null) {
        throw new ReviewTriggerParseError(
          "trigger.lookback_days is required for price_return_pct.",
        );
      }
      const trigger: ConditionReviewTrigger = {
        type: "condition",
        metric,
        symbol,
        operator: operator as ConditionOperator,
        value: value.value,
      };
      if (lookbackDays != null) trigger.lookback_days = lookbackDays;
      return trigger;
    }
    default:
      throw new ReviewTriggerParseError(
        "trigger.type must be scheduled, event_window, or condition.",
      );
  }
}

export function denormalizedSchedule(
  trigger: ReviewTrigger,
): ReviewTriggerSchedule {
  switch (trigger.type) {
    case "scheduled":
      return {
        scheduled_for: trigger.at,
        not_before: trigger.at,
        due_by: null,
      };
    case "event_window":
      return {
        scheduled_for: trigger.not_before,
        not_before: trigger.not_before,
        due_by: trigger.due_by,
      };
    case "condition":
      return {
        scheduled_for: null,
        not_before: null,
        due_by: null,
      };
    default: {
      const _exhaustive: never = trigger;
      return _exhaustive;
    }
  }
}

function compareNumber(
  left: number,
  operator: ConditionOperator,
  right: number,
): boolean {
  switch (operator) {
    case "lt":
      return left < right;
    case "lte":
      return left <= right;
    case "gt":
      return left > right;
    case "gte":
      return left >= right;
    case "eq":
      return left === right;
    default: {
      const _exhaustive: never = operator;
      return _exhaustive;
    }
  }
}

export function isTriggerEvaluable(trigger: ReviewTrigger): boolean {
  switch (trigger.type) {
    case "scheduled":
    case "event_window":
      return true;
    case "condition":
      return isConditionMetricEvaluable(trigger.metric);
    default: {
      const _exhaustive: never = trigger;
      return _exhaustive;
    }
  }
}

export function evaluateTrigger(
  trigger: ReviewTrigger,
  asOf: Date,
  market: MarketObservation = { lastPrice: {}, returnPct: {} },
): { satisfied: boolean; evaluable: boolean; reason: string } {
  switch (trigger.type) {
    case "scheduled": {
      const at = new Date(trigger.at);
      if (asOf.getTime() >= at.getTime()) {
        return {
          satisfied: true,
          evaluable: true,
          reason: "scheduled time has been reached",
        };
      }
      return {
        satisfied: false,
        evaluable: true,
        reason: "scheduled time is still in the future",
      };
    }
    case "event_window": {
      const notBefore = new Date(trigger.not_before);
      if (asOf.getTime() >= notBefore.getTime()) {
        return {
          satisfied: true,
          evaluable: true,
          reason: "event window has opened",
        };
      }
      return {
        satisfied: false,
        evaluable: true,
        reason: "event window has not opened",
      };
    }
    case "condition": {
      if (!isConditionMetricEvaluable(trigger.metric)) {
        return {
          satisfied: false,
          evaluable: false,
          reason: `metric ${trigger.metric} is not auto-evaluable`,
        };
      }
      const observed =
        trigger.metric === "price"
          ? (market.lastPrice[trigger.symbol] ?? null)
          : (market.returnPct[
              returnPctKey(trigger.symbol, trigger.lookback_days ?? 0)
            ] ?? null);
      if (observed == null || !Number.isFinite(observed)) {
        return {
          satisfied: false,
          evaluable: true,
          reason: "market observation is missing",
        };
      }
      if (compareNumber(observed, trigger.operator, trigger.value)) {
        return {
          satisfied: true,
          evaluable: true,
          reason: "condition is satisfied",
        };
      }
      return {
        satisfied: false,
        evaluable: true,
        reason: "condition is not satisfied",
      };
    }
    default: {
      const _exhaustive: never = trigger;
      return _exhaustive;
    }
  }
}

export function evaluateReviewTriggers(
  tasks: readonly ReviewTriggerTask[],
  asOf: Date,
  market: MarketObservation = { lastPrice: {}, returnPct: {} },
): { markDueIds: string[]; evaluations: TriggerEvaluation[] } {
  const evaluations: TriggerEvaluation[] = [];
  const markDueIds: string[] = [];
  for (const task of tasks) {
    const result = evaluateTrigger(task.trigger, asOf, market);
    evaluations.push({
      taskId: task.id,
      satisfied: result.satisfied,
      evaluable: result.evaluable,
      reason: result.reason,
    });
    if (task.status === "pending" && result.satisfied) {
      markDueIds.push(task.id);
    }
  }
  return { markDueIds, evaluations };
}
