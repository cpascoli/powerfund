import type { Handler } from "@netlify/functions";

import { kickBackground } from "./lib/kick-background";

/**
 * Weekly fundamentals refresh. Filings are quarterly; daily would mostly
 * re-upsert the same rows. Scheduled functions are capped at ~30s, so this
 * only kicks the background ingest (15-minute limit).
 *
 * v1 `handler` — this directory uses esbuild, which does not invoke a
 * v2 default export. Schedule stays in netlify.toml.
 */
export const handler: Handler = async () => {
  console.log(
    "[scheduled-ingest-fundamentals] entered",
    new Date().toISOString(),
  );
  try {
    const res = await kickBackground("ingest-fundamentals-background", {
      trigger: "scheduled",
    });

    console.log(
      "[scheduled-ingest-fundamentals] triggered background function",
      res.status,
    );

    const body = JSON.stringify({
      ok: res.ok,
      triggered: true,
      status: res.status,
    });
    return { statusCode: res.ok ? 200 : 500, body };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[scheduled-ingest-fundamentals]", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: message }),
    };
  }
};
