import type { Config } from "@netlify/functions";

import { kickBackground } from "./lib/kick-background";

/**
 * After the US cash close (22:00 UTC weekdays ≈ 18:00 ET / 17:00 ET).
 * Scheduled functions are capped at ~30s, so this only kicks the background
 * ingest (15-minute limit) — same pattern as CoinStrat.
 */
export const config: Config = {
  schedule: "0 22 * * 1-5",
};

export default async (): Promise<Response> => {
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

    if (!res.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          triggered: true,
          status: res.status,
        }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, triggered: true, status: res.status }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[scheduled-ingest-bars]", error);

    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
