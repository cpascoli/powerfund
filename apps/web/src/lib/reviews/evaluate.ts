import {
  findDueReviewTaskIds,
  latchDueReviewTasks,
  loadMarketObservation,
  markReviewTasksDue,
} from "@powerfund/db";

import type { DbClient } from "@/lib/supabase/db";

/**
 * Review-trigger evaluation lives in @powerfund/db (review-triggers.ts) so
 * the worker latches with the same code the app reads with. These names are
 * kept for existing callers.
 */
export { loadMarketObservation, markReviewTasksDue };

/** Latch fired triggers (pending → due). Used by the default REST reads and the Briefing. */
export function evaluateStoredReviewTriggers(
  supabase: DbClient,
  asOf = new Date(),
): Promise<number> {
  return latchDueReviewTasks(supabase, asOf);
}

/** Which pending reviews have fired, without recording it. */
export function previewDueReviewTaskIds(
  supabase: DbClient,
  asOf = new Date(),
): Promise<string[]> {
  return findDueReviewTaskIds(supabase, asOf);
}
