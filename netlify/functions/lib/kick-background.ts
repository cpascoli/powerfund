import { siteUrl } from "./site-url";

/**
 * Kick a `-background` function. Scheduled functions are capped at ~30s;
 * the background suffix has a 15-minute budget.
 */
export async function kickBackground(
  name: string,
  body: Record<string, unknown>,
): Promise<globalThis.Response> {
  const cronSecret = process.env.CRON_SECRET || "";
  if (!cronSecret) {
    throw new Error("CRON_SECRET is not set.");
  }

  const base = siteUrl();

  return fetch(`${base}/.netlify/functions/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cronSecret}`,
    },
    body: JSON.stringify(body),
  });
}
