import type { Handler } from "@netlify/functions";

import { snapshotPortfolio } from "../../apps/worker/src/snapshot/portfolio";

/**
 * 30 minutes after the EOD bars ingest kicks off (22:00 UTC), so positions
 * are marked at today's close. A snapshot is a handful of queries, well
 * inside the ~30s scheduled budget — no background hop needed (ADR 0006
 * applies to the long-running ingest only).
 *
 * v1 `handler` — this directory uses esbuild, which does not invoke a
 * v2 default export. Schedule stays in netlify.toml.
 */
export const handler: Handler = async () => {
  console.log(
    "[scheduled-snapshot-portfolio] entered",
    new Date().toISOString(),
  );
  try {
    const result = await snapshotPortfolio();
    console.log("[scheduled-snapshot-portfolio]", JSON.stringify(result));
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, ...result }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[scheduled-snapshot-portfolio]", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: message }),
    };
  }
};
