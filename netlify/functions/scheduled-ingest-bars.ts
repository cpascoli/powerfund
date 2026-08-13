import type { Config } from "@netlify/functions";

/**
 * After the US cash close (22:00 UTC weekdays ≈ 18:00 ET / 17:00 ET).
 * Scheduled functions are capped at ~30s, so this only kicks the background
 * ingest (15-minute limit) — same pattern as CoinStrat.
 */
export const config: Config = {
  schedule: "0 22 * * 1-5",
};

export default async (): Promise<Response> => {
  const base =
    process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL || "";
  const cronSecret = process.env.CRON_SECRET || "";

  try {
    if (!base) {
      throw new Error(
        "Site URL (process.env.URL) is unavailable; cannot invoke background function.",
      );
    }
    if (!cronSecret) {
      throw new Error("CRON_SECRET is not set.");
    }

    const res = await fetch(`${base}/.netlify/functions/ingest-bars-background`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({ trigger: "scheduled", days: 7 }),
    });

    console.log("[scheduled-ingest-bars] triggered background function", res.status);

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
