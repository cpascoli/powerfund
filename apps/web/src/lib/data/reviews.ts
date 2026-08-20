import { OPEN_REVIEW_TASK_STATUSES } from "@powerfund/domain";

import { evaluateStoredReviewTriggers } from "@/lib/reviews/evaluate";
import {
  hydrateReviewTasks,
  listReviewTaskRows,
  type ReviewTaskRecord,
} from "@/lib/reviews/records";
import { resolveDb, type DbClient } from "@/lib/supabase/db";

export type { ReviewTaskRecord };

export async function listOpenReviewTasks(
  client?: DbClient,
): Promise<ReviewTaskRecord[]> {
  const supabase = await resolveDb(client);
  await evaluateStoredReviewTriggers(supabase);
  const rows = await listReviewTaskRows(supabase, [
    ...OPEN_REVIEW_TASK_STATUSES,
  ]);
  return hydrateReviewTasks(supabase, rows);
}
