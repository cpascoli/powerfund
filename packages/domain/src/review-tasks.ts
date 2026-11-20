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
  /**
   * Day the price `value` was last stated, for a `price` metric. A split that
   * takes effect after it re-bases the threshold; one on or before it does not.
   * Absent on triggers written before splits were handled, which fall back to
   * the task's creation date.
   */
  price_basis_date?: string;
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
  /**
   * Product of the splits that took effect after a price threshold was
   * written. The stored value is divided by it before comparing, so the
   * threshold and the close are on one share basis. Absent means 1.
   */
  priceBasisFactor?: number;
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
      if (
        typeof value.price_basis_date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(value.price_basis_date)
      ) {
        trigger.price_basis_date = value.price_basis_date;
      }
      return trigger;
    }
    default:
      throw new ReviewTriggerParseError(
        "trigger.type must be scheduled, event_window, or condition.",
      );
  }
}

/**
 * Record the day a price threshold was stated.
 *
 * Called on the write path only — when a caller supplies a trigger — and never
 * when a stored one is re-read, so editing a task's title does not quietly
 * move the basis of a threshold nobody restated. Whatever the caller sent for
 * `price_basis_date` is overwritten: the basis is when we received the number.
 */
export function stampPriceBasis(
  trigger: ReviewTrigger,
  session: string,
): ReviewTrigger {
  if (trigger.type !== "condition") return trigger;
  if (trigger.metric !== "price") {
    const { price_basis_date: _dropped, ...rest } = trigger;
    return rest;
  }
  return { ...trigger, price_basis_date: session };
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

/**
 * `priceBasisFactor` exists because a price threshold is a per-share number
 * with a date on it. "Revisit SNDK below $1,500" was written when a share cost
 * $1,740; after an eight-for-one split the close is $94 and the naive
 * comparison fires on a stock that has not fallen at all. The stored value is
 * never rewritten — the review must still read as it was written — so the
 * threshold is restated here, at the moment of comparison, and the reason says
 * so. A return condition needs none of this: both of its closes come from the
 * same split-adjusted series.
 */
export function evaluateTrigger(
  trigger: ReviewTrigger,
  asOf: Date,
  market: MarketObservation = { lastPrice: {}, returnPct: {} },
  options?: { priceBasisFactor?: number },
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
      const factor = options?.priceBasisFactor ?? 1;
      if (!Number.isFinite(factor) || factor <= 0) {
        return {
          satisfied: false,
          evaluable: false,
          reason: "split basis for this threshold is unknown",
        };
      }
      const restated = trigger.metric === "price" && factor !== 1;
      const threshold = restated ? trigger.value / factor : trigger.value;
      const basis = restated
        ? ` (threshold ${trigger.value} restated to ${Number(threshold.toFixed(4))} after a split)`
        : "";
      if (compareNumber(observed, trigger.operator, threshold)) {
        return {
          satisfied: true,
          evaluable: true,
          reason: `condition is satisfied${basis}`,
        };
      }
      return {
        satisfied: false,
        evaluable: true,
        reason: `condition is not satisfied${basis}`,
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
    const result = evaluateTrigger(task.trigger, asOf, market, {
      priceBasisFactor: task.priceBasisFactor,
    });
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
