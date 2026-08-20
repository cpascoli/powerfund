import {
  OPEN_REVIEW_TASK_STATUSES,
  isReviewTaskStatus,
  type ReviewTaskStatus,
} from "@powerfund/domain";

import { validationError } from "@/lib/api/agent/errors";
import type { DbClient } from "@/lib/supabase/db";

import { evaluateStoredReviewTriggers } from "./evaluate";
import {
  hydrateReviewTasks,
  listReviewTaskRows,
  type ReviewTaskRecord,
} from "./records";

export type ReviewQueueQuery = {
  status?: string | null;
  evaluate?: boolean;
};

export type ReviewRadarItem = {
  id: string;
  title: string;
  scope: ReviewTaskRecord["scope"];
  priority: ReviewTaskRecord["priority"];
  status: ReviewTaskStatus;
  trigger_type: ReviewTaskRecord["trigger"]["type"];
  evaluable: boolean;
  scheduled_for: string | null;
  not_before: string | null;
  due_by: string | null;
  became_due_at: string | null;
  symbols: string[];
};

function toRadar(task: ReviewTaskRecord): ReviewRadarItem {
  return {
    id: task.id,
    title: task.title,
    scope: task.scope,
    priority: task.priority,
    status: task.status,
    trigger_type: task.trigger.type,
    evaluable: task.evaluable,
    scheduled_for: task.scheduled_for,
    not_before: task.not_before,
    due_by: task.due_by,
    became_due_at: task.became_due_at,
    symbols: task.symbols,
  };
}

function parseStatuses(value: string | null | undefined): ReviewTaskStatus[] {
  if (value == null || value.trim().length === 0 || value === "open") {
    return [...OPEN_REVIEW_TASK_STATUSES];
  }
  if (value === "all") {
    return [];
  }
  if (!isReviewTaskStatus(value)) {
    throw validationError("Invalid status filter.");
  }
  return [value];
}

export async function getReviewQueue(
  supabase: DbClient,
  query: ReviewQueueQuery = {},
) {
  const asOf = new Date();
  const markedDue =
    query.evaluate === false
      ? 0
      : await evaluateStoredReviewTriggers(supabase, asOf);
  const statuses = parseStatuses(query.status);
  const rows = await listReviewTaskRows(
    supabase,
    statuses.length > 0 ? statuses : undefined,
  );
  const tasks = await hydrateReviewTasks(supabase, rows);
  return {
    as_of: asOf.toISOString(),
    marked_due: markedDue,
    tasks,
  };
}

export async function getReviewRadar(supabase: DbClient) {
  const asOf = new Date();
  await evaluateStoredReviewTriggers(supabase, asOf);
  const rows = await listReviewTaskRows(supabase, [
    "pending",
    "due",
    "in_progress",
  ]);
  const tasks = await hydrateReviewTasks(supabase, rows);
  const due = tasks
    .filter((row) => row.status === "due")
    .slice(0, 20)
    .map(toRadar);
  const upcoming = tasks
    .filter((row) => row.status === "pending")
    .slice(0, 10)
    .map(toRadar);
  return {
    due_reviews: due,
    upcoming_reviews: upcoming,
  };
}
