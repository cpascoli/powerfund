/**
 * Production site origin used to kick background functions.
 * Netlify usually sets URL; fall back so a missing platform var cannot
 * silently skip the nightly ingest.
 */
export function siteUrl(): string {
  const url =
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.DEPLOY_URL ||
    "https://powerfund.netlify.app";
  return url.replace(/\/$/, "");
}
