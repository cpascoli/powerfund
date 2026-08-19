import { ingestBars } from "./ingest/bars";
import { ingestFundamentals } from "./ingest/fundamentals";
import { snapshotPortfolio } from "./snapshot/portfolio";
import "./env";

function usage() {
  console.log(`Power Fund worker

Usage:
  pnpm --filter @powerfund/worker ingest:bars [-- --days=365 --symbols=SPY,QQQ]
  pnpm --filter @powerfund/worker ingest:fundamentals
  pnpm --filter @powerfund/worker ingest:all
  pnpm --filter @powerfund/worker snapshot:portfolio

Env:
  SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  TIINGO_API_KEY (optional; preferred for daily bars)

Vendors (free):
  bars: Tiingo → Yahoo chart → Stooq
  fundamentals: SEC companyfacts + Yahoo hole-fill
`);
}

function readFlag(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

async function main() {
  const command = process.argv[2] ?? "help";
  const days = Number(readFlag("days", "730"));
  const pauseMs = Number(readFlag("pauseMs", "1200"));
  const symbolsFlag = readFlag("symbols", "");
  const symbols = symbolsFlag
    .split(",")
    .map((symbol) => symbol.trim())
    .filter((symbol) => symbol.length > 0);

  switch (command) {
    case "bars":
      await ingestBars({ days, pauseMs, symbols });
      break;
    case "fundamentals": {
      const result = await ingestFundamentals({ pauseMs });
      console.log("[ingest:fundamentals]", JSON.stringify(result));
      if (result.failed.length > 0) process.exitCode = 1;
      break;
    }
    case "all": {
      const bars = await ingestBars({ days, pauseMs });
      if (bars.failed.length > 0) process.exitCode = 1;
      const fundamentals = await ingestFundamentals({ pauseMs });
      console.log("[ingest:fundamentals]", JSON.stringify(fundamentals));
      if (fundamentals.failed.length > 0) process.exitCode = 1;
      break;
    }
    case "snapshot":
      console.log(
        "[snapshot:portfolio]",
        JSON.stringify(await snapshotPortfolio()),
      );
      break;
    case "help":
    case "--help":
    case "-h":
      usage();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      usage();
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
