import type { Handler } from "@netlify/functions";

import { kickBackground } from "./lib/kick-background";

/**
 * After the US cash close (22:00 UTC weekdays ≈ 18:00 ET / 17:00 ET).
 * Scheduled functions are capped at ~30s, so this only kicks the background
 * ingest (15-minute limit) — same pattern as CoinStrat.
 *
 * v1 `handler` (not v2 `export default`): this directory uses
 * `node_bundler = esbuild`, which looks for `handler`. A default export
 * never ran — including Netlify UI "Run now".
 */
export const handler: Handler = async () => {
  console.log(
    "[scheduled-ingest-bars] entered",
    new Date().toISOString(),
  );
  try {
    const res = await kickBackground("ingest-bars-background", {
      trigger: "scheduled",
      days: 7,
    });

    console.log("[scheduled-ingest-bars] triggered background function", res.status);

    const body = JSON.stringify({
      ok: res.ok,
      triggered: true,
      status: res.status,
    });
    return { statusCode: res.ok ? 200 : 500, body };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[scheduled-ingest-bars]", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: message }),
    };
  }
};
