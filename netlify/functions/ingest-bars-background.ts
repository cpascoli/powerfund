import type { Handler } from "@netlify/functions";

import { ingestBars } from "../../apps/worker/src/ingest/bars";
import { scoreInflectionBestEffort } from "../../apps/worker/src/score/inflection";
import { snapshotPortfolio } from "../../apps/worker/src/snapshot/portfolio";
import { authorizeCron } from "./lib/cron-auth";

/**
 * Background function (15-minute limit via `-background` suffix).
 * Recent daily bars + market caps, then tonight's NAV snapshot.
 * Optional HTTP trigger; production cron is GitHub Actions (ADR 0006).
 * Auth: Bearer CRON_SECRET.
 */
export const handler: Handler = async (event) => {
  if (!authorizeCron(event)) {
    console.warn("[ingest-bars-background] unauthorized invocation; skipping");
    return { statusCode: 401, body: "unauthorized" };
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
    if (result.failed.length > 0) {
      console.error("[ingest-bars-background] failed symbols", result.failed);
    }
  } catch (error) {
    console.error("[ingest-bars-background]", error);
  }

  try {
    const snapshot = await snapshotPortfolio();
    console.log("[ingest-bars-background] snapshot", JSON.stringify(snapshot));
  } catch (error) {
    console.error("[ingest-bars-background] snapshot", error);
  }

  await scoreInflectionBestEffort();

  return { statusCode: 202, body: "" };
};
