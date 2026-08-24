import type { Config } from "@netlify/functions";

/**
 * Temporary probe: does Netlify invoke any scheduled function?
 * Same shape as PowerWallet scheduled-alerts: v2 default + config.schedule.
 * Remove once ingest cron is proven. Hourly UTC, log only.
 */
export const config: Config = {
  schedule: "0 * * * *",
};

export default async (): Promise<Response> => {
  const at = new Date().toISOString();
  console.log("[scheduled-heartbeat] entered", at);
  return new Response(JSON.stringify({ ok: true, at }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
