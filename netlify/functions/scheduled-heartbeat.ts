import type { Handler } from "@netlify/functions";

/**
 * Temporary probe: does Netlify invoke any scheduled function?
 * Remove once ingest cron is proven. Hourly UTC, log only.
 */
export const handler: Handler = async () => {
  const at = new Date().toISOString();
  console.log("[scheduled-heartbeat] entered", at);
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, at }),
  };
};
