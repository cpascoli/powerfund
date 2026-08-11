import { CORE_THEMES } from "@powerfund/domain";

/**
 * Phase 1 stub — scheduled ingest / normalize / score jobs land in Phase 2.
 * Run with: pnpm dev:worker
 */
function main() {
  const themeNames = CORE_THEMES.map((theme) => theme.name).join(", ");
  console.log("[powerfund-worker] stub online");
  console.log(`[powerfund-worker] themes in scope: ${themeNames}`);
  console.log(
    "[powerfund-worker] next: wire market + filings ingest once data sources are chosen",
  );
}

main();
