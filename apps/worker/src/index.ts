import { ingestBars } from "./ingest/bars";
import { ingestFundamentals } from "./ingest/fundamentals";
import "./env";

function usage() {
  console.log(`Power Fund worker

Usage:
  pnpm --filter @powerfund/worker ingest:bars [-- --days=365]
  pnpm --filter @powerfund/worker ingest:fundamentals
  pnpm --filter @powerfund/worker ingest:all

Env:
  SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  TIINGO_API_KEY (optional; preferred for daily bars)

Vendors (free):
  bars: Tiingo → Yahoo chart → Stooq
  fundamentals: SEC companyfacts → Yahoo fundamentalsTimeSeries
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

  switch (command) {
    case "bars":
      await ingestBars({ days, pauseMs });
      break;
    case "fundamentals":
      await ingestFundamentals({ pauseMs });
      break;
    case "all":
      await ingestBars({ days, pauseMs });
      await ingestFundamentals({ pauseMs });
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
