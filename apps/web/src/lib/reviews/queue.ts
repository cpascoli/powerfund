import { type ReviewTaskStatus } from "@powerfund/domain";

import type { DbClient } from "@/lib/supabase/db";

import { evaluateStoredReviewTriggers } from "./evaluate";
import {
  describeReviewQueueFilter,
  parseReviewQueueFilter,
  type ReviewQueueFilter,
} from "./filter";
import {
  hydrateReviewTasks,
  listReviewTaskRows,
  reviewTaskIdsFor,
  type ReviewTaskRecord,
} from "./records";

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

/**
 * Read the queue, or read its history.
 *
 * Completed outcomes are the record of what the book believed at each point —
 * the 30 August diagnostic concluding that 81% of losses sat in one factor, the
 * September pass holding the baseline, the ranking that deployed nothing. The
 * operating process requires loading the relevant ones before completing a
 * comparable review, so this has to answer "the last five touching CRDO"
 * without returning every row ever written.
 */
export async function getReviewQueue(
  supabase: DbClient,
  filter: ReviewQueueFilter,
) {
  const asOf = new Date();
  const markedDue = filter.evaluate
    ? await evaluateStoredReviewTriggers(supabase, asOf)
    : 0;

  const linkedIds = await reviewTaskIdsFor(supabase, {
    symbols: filter.symbols,
    themes: filter.themes,
  });

  // Ask for one more than requested so the caller learns there is more history
  // rather than silently seeing a truncated chain of reasoning.
  const rows = await listReviewTaskRows(
    supabase,
    filter.statuses.length > 0 ? filter.statuses : undefined,
    {
      scope: filter.scope,
      ids: linkedIds ?? undefined,
      completedSince: filter.completedSince,
      completedBefore: filter.completedBefore,
      limit: filter.limit + 1,
      order: filter.order,
      orderBy: filter.historical ? "completed_at" : "queue",
    },
  );

  const truncated = rows.length > filter.limit;
  const tasks = await hydrateReviewTasks(
    supabase,
    truncated ? rows.slice(0, filter.limit) : rows,
  );

  return {
    as_of: asOf.toISOString(),
    marked_due: markedDue,
    filter: describeReviewQueueFilter(filter),
    returned: tasks.length,
    truncated,
    tasks,
  };
}

export { parseReviewQueueFilter };

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
