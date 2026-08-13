import type { Config } from "@netlify/functions";

import { snapshotPortfolio } from "../../apps/worker/src/snapshot/portfolio";

/**
 * 30 minutes after the EOD bars ingest kicks off (22:00 UTC), so positions
 * are marked at today's close. A snapshot is a handful of queries, well
 * inside the ~30s scheduled budget — no background hop needed (ADR 0006
 * applies to the long-running ingest only).
 */
export const config: Config = {
  schedule: "30 22 * * 1-5",
};

export default async (): Promise<Response> => {
  try {
    const result = await snapshotPortfolio();
    console.log("[scheduled-snapshot-portfolio]", JSON.stringify(result));
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[scheduled-snapshot-portfolio]", error);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
