import type { Config } from "@netlify/functions";

import { kickBackground } from "./lib/kick-background";

/**
 * Weekly fundamentals refresh. Filings are quarterly; daily would mostly
 * re-upsert the same rows. Scheduled functions are capped at ~30s, so this
 * only kicks the background ingest (15-minute limit).
 */
export const config: Config = {
  schedule: "0 8 * * 0",
};

export default async (): Promise<Response> => {
  try {
    const res = await kickBackground("ingest-fundamentals-background", {
      trigger: "scheduled",
    });

    console.log(
      "[scheduled-ingest-fundamentals] triggered background function",
      res.status,
    );

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
    console.error("[scheduled-ingest-fundamentals]", error);

    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
