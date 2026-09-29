import { latchDueReviewTasks } from "@powerfund/db";

import { createAdminDb } from "../db";

/**
 * Record every review whose trigger has fired (pending → due).
 *
 * Runs after each bars ingest because that is the only time a price
 * condition's inputs change, and a condition is evaluated against the latest
 * close, so it can stop being true. Latching here means a dip below a
 * threshold stays an obligation even if the price recovers before anyone
 * opens the Briefing. Read-only MCP reads only preview due-ness; this is what
 * makes that safe. Date triggers latch here too, once a night.
 */
export async function latchReviewTriggers(asOf = new Date()): Promise<number> {
  const flipped = await latchDueReviewTasks(createAdminDb(), asOf);
  console.log(`[reviews:latch] ${flipped} review task(s) pending → due`);
  return flipped;
}
