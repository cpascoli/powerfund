import type { Handler } from "@netlify/functions";

import { ingestFundamentals } from "../../apps/worker/src/ingest/fundamentals";
import { scoreInflectionBestEffort } from "../../apps/worker/src/score/inflection";
import { authorizeCron } from "./lib/cron-auth";

/**
 * Background function (15-minute limit via `-background` suffix).
 * Weekly SEC+Yahoo fundamentals for the research watchlist.
 * Auth: Bearer CRON_SECRET.
 */
export const handler: Handler = async (event) => {
  if (!authorizeCron(event)) {
    console.warn(
      "[ingest-fundamentals-background] unauthorized invocation; skipping",
    );
    return { statusCode: 401, body: "unauthorized" };
  }

  try {
    const result = await ingestFundamentals({ pauseMs: 800 });
    console.log("[ingest-fundamentals-background]", JSON.stringify(result));
    if (result.failed.length > 0) {
      console.error(
        "[ingest-fundamentals-background] failed symbols",
        result.failed,
      );
    }
  } catch (error) {
    console.error("[ingest-fundamentals-background]", error);
  }

  await scoreInflectionBestEffort();

  return { statusCode: 202, body: "" };
};
