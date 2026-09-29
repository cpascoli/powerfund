import { type ReviewTaskStatus } from "@powerfund/domain";

import type { DbClient } from "@/lib/supabase/db";

import { evaluateStoredReviewTriggers, previewDueReviewTaskIds } from "./evaluate";
import {
  describeReviewQueueFilter,
  parseReviewQueueFilter,
  REVIEW_QUEUE_MAX_LIMIT,
  type ReviewQueueFilter,
} from "./filter";
import {
  hydrateReviewTasks,
  listReviewTaskRows,
  reviewTaskIdsFor,
  type ReviewTaskRecord,
  type ReviewTaskRow,
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
  /** Due because its trigger has fired, not yet recorded (preview reads). */
  due_by_trigger?: boolean;
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
    due_by_trigger: (task as PreviewedTask).due_by_trigger,
  };
}

type PreviewedTask = ReviewTaskRecord & { due_by_trigger?: boolean };

/**
 * Show a fired-but-unrecorded trigger as due, in memory only. The stored row
 * stays `pending` until the latch runs (after the next bars ingest, or the
 * next default read), so a read-only caller sees the same queue the Briefing
 * would without changing it.
 */
function overlayPreviewedDue(rows: ReviewTaskRow[], dueIds: ReadonlySet<string>): ReviewTaskRow[] {
  if (dueIds.size === 0) return rows;
  return rows.map((row) =>
    row.status === "pending" && dueIds.has(row.id) ? { ...row, status: "due" } : row,
  );
}

function markPreviewed(tasks: ReviewTaskRecord[], dueIds: ReadonlySet<string>): PreviewedTask[] {
  return tasks.map((task) =>
    dueIds.has(task.id) && task.became_due_at == null ? { ...task, due_by_trigger: true } : task,
  );
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
  const previewed = filter.previewDue
    ? new Set(await previewDueReviewTaskIds(supabase, asOf))
    : new Set<string>();

  const linkedIds = await reviewTaskIdsFor(supabase, {
    symbols: filter.symbols,
    themes: filter.themes,
  });

  // A previewed "due" task is still stored as pending. When the caller asked
  // for due work without asking for pending, fetch pending too, relabel, and
  // filter afterwards. The open queue is tens of rows, so fetch it whole
  // rather than let a page boundary cut a due task off.
  const expand =
    previewed.size > 0 &&
    filter.statuses.includes("due") &&
    !filter.statuses.includes("pending");
  const queryStatuses = expand ? [...filter.statuses, "pending" as const] : filter.statuses;

  // Ask for one more than requested so the caller learns there is more history
  // rather than silently seeing a truncated chain of reasoning.
  const fetched = await listReviewTaskRows(
    supabase,
    queryStatuses.length > 0 ? queryStatuses : undefined,
    {
      scope: filter.scope,
      ids: linkedIds ?? undefined,
      completedSince: filter.completedSince,
      completedBefore: filter.completedBefore,
      limit: expand ? REVIEW_QUEUE_MAX_LIMIT * 2 : filter.limit + 1,
      order: filter.order,
      orderBy: filter.historical ? "completed_at" : "queue",
    },
  );
  const rows = overlayPreviewedDue(fetched, previewed).filter(
    (row) => filter.statuses.length === 0 || filter.statuses.includes(row.status),
  );

  const truncated = rows.length > filter.limit;
  const tasks = markPreviewed(
    await hydrateReviewTasks(supabase, truncated ? rows.slice(0, filter.limit) : rows),
    previewed,
  );

  return {
    as_of: asOf.toISOString(),
    marked_due: markedDue,
    previewed_due: filter.previewDue ? previewed.size : undefined,
    filter: describeReviewQueueFilter(filter),
    returned: tasks.length,
    truncated,
    tasks,
  };
}

export { parseReviewQueueFilter };

/**
 * Due and upcoming reviews for the fund-state snapshot. By default it latches
 * fired triggers first, as the Briefing does; `previewDue` shows them as due
 * without writing, for read-only callers.
 */
export async function getReviewRadar(
  supabase: DbClient,
  options: { previewDue?: boolean } = {},
) {
  const asOf = new Date();
  const previewed = options.previewDue
    ? new Set(await previewDueReviewTaskIds(supabase, asOf))
    : new Set<string>();
  if (!options.previewDue) {
    await evaluateStoredReviewTriggers(supabase, asOf);
  }
  const rows = overlayPreviewedDue(
    await listReviewTaskRows(supabase, ["pending", "due", "in_progress"]),
    previewed,
  );
  const tasks = markPreviewed(await hydrateReviewTasks(supabase, rows), previewed);
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
