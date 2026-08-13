import type { Handler } from "@netlify/functions";

import { ingestBars } from "../../apps/worker/src/ingest/bars";
import { authorizeCron } from "./lib/cron-auth";

/**
 * Background function (15-minute limit via `-background` suffix).
 * Recent daily bars + market caps for the watchlist. Auth: Bearer CRON_SECRET.
 */
export const handler: Handler = async (event) => {
  if (!authorizeCron(event)) {
    console.warn("[ingest-bars-background] unauthorized invocation; skipping");
    return { statusCode: 202, body: "" };
  }

  let days = 7;
  try {
    const parsed = event.body
      ? (JSON.parse(event.body) as { days?: number })
      : null;
    if (typeof parsed?.days === "number" && parsed.days > 0 && parsed.days <= 30) {
      days = Math.floor(parsed.days);
    }
  } catch {
    days = 7;
  }

  try {
    const result = await ingestBars({ days, pauseMs: 400 });
    console.log("[ingest-bars-background]", JSON.stringify(result));
  } catch (error) {
    console.error("[ingest-bars-background]", error);
  }

  return { statusCode: 202, body: "" };
};
