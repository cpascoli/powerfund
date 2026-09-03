import {
  OPEN_REVIEW_TASK_STATUSES,
  REVIEW_TASK_SCOPES,
  isReviewTaskScope,
  isReviewTaskStatus,
  type ReviewTaskScope,
  type ReviewTaskStatus,
} from "@powerfund/domain";

import { validationError } from "@/lib/api/agent/errors";

/**
 * Filters for reading review history, not just the open queue.
 *
 * Completed review outcomes are PowerFund's portfolio memory: dossiers hold
 * company memory, the journal holds decision memory, and the conclusions of past
 * reviews — "roughly 81% of losses sit in AI infrastructure; do not average down
 * on price alone" — live nowhere else. The operating process now requires
 * reading them before completing a comparable review, so the API has to make
 * that cheap rather than returning every row ever written.
 *
 * The two shapes worth serving:
 *   the last few completed reviews relevant to one name, and
 *   every portfolio-level conclusion since the previous monthly pass.
 */

export const REVIEW_QUEUE_DEFAULT_LIMIT = 100;
export const REVIEW_QUEUE_MAX_LIMIT = 500;

export type ReviewQueueOrder = "asc" | "desc";

export type ReviewQueueFilter = {
  /** Empty means every status. */
  statuses: ReviewTaskStatus[];
  scope: ReviewTaskScope | null;
  /** Uppercased tickers; a task matches if it is linked to any of them. */
  symbols: string[];
  /** Theme slugs or names, resolved later against the catalog. */
  themes: string[];
  completedSince: string | null;
  completedBefore: string | null;
  limit: number;
  order: ReviewQueueOrder;
  /** Whether to evaluate pending triggers before listing. */
  evaluate: boolean;
  /** True when the caller asked only for finished work. */
  historical: boolean;
};

function parseStatuses(value: string | null): {
  statuses: ReviewTaskStatus[];
  historical: boolean;
} {
  const raw = value?.trim() ?? "";
  if (raw.length === 0 || raw === "open") {
    return { statuses: [...OPEN_REVIEW_TASK_STATUSES], historical: false };
  }
  if (raw === "all") {
    return { statuses: [], historical: false };
  }
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const statuses: ReviewTaskStatus[] = [];
  for (const part of parts) {
    if (!isReviewTaskStatus(part)) {
      throw validationError(
        `Invalid status filter: ${part}. Use open, all, or one or more of pending, due, in_progress, completed, deferred, cancelled.`,
      );
    }
    if (!statuses.includes(part)) statuses.push(part);
  }
  if (statuses.length === 0) {
    throw validationError("status was empty after parsing.");
  }
  // Nothing pending can become due in a query that only wants finished work.
  const historical = statuses.every(
    (status) => status === "completed" || status === "cancelled",
  );
  return { statuses, historical };
}

function parseScope(value: string | null): ReviewTaskScope | null {
  const raw = value?.trim().toLowerCase() ?? "";
  if (raw.length === 0) return null;
  if (!isReviewTaskScope(raw)) {
    throw validationError(
      `Invalid scope: ${raw}. Expected one of ${REVIEW_TASK_SCOPES.join(", ")}.`,
    );
  }
  return raw;
}

function parseList(
  value: string | null,
  normalize: (part: string) => string = (part) => part,
): string[] {
  if (value == null) return [];
  // Normalise before deduping, or `CRDO,crdo` survives as two entries.
  return [
    ...new Set(
      value
        .split(",")
        .map((part) => normalize(part.trim()))
        .filter(Boolean),
    ),
  ];
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseInstant(value: string | null, field: string): string | null {
  const raw = value?.trim() ?? "";
  if (raw.length === 0) return null;
  // A bare date means the whole day, so the caller does not have to think about
  // time zones to ask "since the monthly pass".
  const candidate = DATE_ONLY.test(raw) ? `${raw}T00:00:00.000Z` : raw;
  const parsed = Date.parse(candidate);
  if (Number.isNaN(parsed)) {
    throw validationError(`${field} must be an ISO date or datetime.`);
  }
  return new Date(parsed).toISOString();
}

function parseLimit(value: string | null): number {
  const raw = value?.trim() ?? "";
  if (raw.length === 0) return REVIEW_QUEUE_DEFAULT_LIMIT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw validationError("limit must be a positive integer.");
  }
  return Math.min(parsed, REVIEW_QUEUE_MAX_LIMIT);
}

function parseOrder(
  value: string | null,
  historical: boolean,
): ReviewQueueOrder {
  const raw = value?.trim().toLowerCase() ?? "";
  if (raw.length === 0) {
    // History reads newest-first — "the last five" is the common ask. The open
    // queue reads oldest-first, because that is the order it must be worked.
    return historical ? "desc" : "asc";
  }
  if (raw !== "asc" && raw !== "desc") {
    throw validationError("order must be asc or desc.");
  }
  return raw;
}

export function parseReviewQueueFilter(
  params: URLSearchParams,
): ReviewQueueFilter {
  const { statuses, historical } = parseStatuses(params.get("status"));
  const evaluateRaw = params.get("evaluate");
  const evaluate =
    evaluateRaw == null
      ? // Evaluating triggers mutates pending rows. A history query has no
        // business doing that, so it is off unless asked for.
        !historical
      : evaluateRaw !== "false" && evaluateRaw !== "0";

  return {
    statuses,
    scope: parseScope(params.get("scope")),
    symbols: parseList(params.get("symbol") ?? params.get("symbols"), (part) =>
      part.toUpperCase(),
    ),
    themes: parseList(params.get("theme") ?? params.get("themes")),
    completedSince: parseInstant(
      params.get("completed_since"),
      "completed_since",
    ),
    completedBefore: parseInstant(
      params.get("completed_before"),
      "completed_before",
    ),
    limit: parseLimit(params.get("limit")),
    order: parseOrder(params.get("order"), historical),
    evaluate,
    historical,
  };
}

/** Echoed back so an agent can see what it actually asked for. */
export function describeReviewQueueFilter(filter: ReviewQueueFilter) {
  return {
    status: filter.statuses.length === 0 ? "all" : filter.statuses.join(","),
    scope: filter.scope,
    symbols: filter.symbols.length > 0 ? filter.symbols : null,
    themes: filter.themes.length > 0 ? filter.themes : null,
    completed_since: filter.completedSince,
    completed_before: filter.completedBefore,
    limit: filter.limit,
    order: filter.order,
  };
}
