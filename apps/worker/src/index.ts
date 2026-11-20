import { appendFileSync } from "node:fs";

import {
  applySplit,
  checkBookIntegrity,
  listSplits,
  printBookIntegrity,
  registerSplit,
  rejectSplit,
} from "./corporate-actions";
import { auditBars, printBarAudit } from "./ingest/audit-bars";
import { ingestBars } from "./ingest/bars";
import { loadBarsFreshness } from "./ingest/freshness";
import { ingestFundamentals } from "./ingest/fundamentals";
import { latchReviewTriggers } from "./reviews/latch";
import { scoreInflectionUniverse } from "./score/inflection";
import { printReplay, replayInflection } from "./score/replay";
import { snapshotPortfolio } from "./snapshot/portfolio";
import {
  printBookVerification,
  verifyBookAgainstLedger,
} from "./snapshot/verify-book";
import "./env";

function usage() {
  console.log(`Power Fund worker

Usage:
  pnpm --filter @powerfund/worker ingest:bars [-- --days=365 --symbols=SPY,QQQ]
  pnpm --filter @powerfund/worker ingest:fundamentals [-- --symbols=SKHY,TSM]
  pnpm --filter @powerfund/worker ingest:all
  pnpm --filter @powerfund/worker bars:audit [-- --threshold=35 --symbols=APH]
  pnpm --filter @powerfund/worker bars:freshness   (does the store reach the last completed session?)
  pnpm --filter @powerfund/worker score:inflection [-- --asOf=2026-06-30]
  pnpm --filter @powerfund/worker score:replay [-- --from=2022-01-01 --every=21 --symbols=NVDA,VRT]
  pnpm --filter @powerfund/worker snapshot:portfolio
  pnpm --filter @powerfund/worker snapshot:verify   (dry run — rebuild and diff, write nothing)
  pnpm --filter @powerfund/worker verify:book      (positions/cash vs the ledger, and the append-only guards)
  pnpm --filter @powerfund/worker reviews:latch    (record fired review triggers: pending → due; also runs after ingest:bars)
  pnpm --filter @powerfund/worker book:integrity   (missing closes, pending splits, share-basis mismatches; exits 1 when a held name is on the wrong share basis)
  pnpm --filter @powerfund/worker splits           (list corporate actions)
  pnpm --filter @powerfund/worker splits:register -- --symbol=SNDK --effective=2026-11-20 --ratio=8:1 [--notes=...]
  pnpm --filter @powerfund/worker splits:apply -- --id=<uuid> --verifiedBy=<who> --notes=<what was checked> [--fractional=retained|cash_in_lieu]
  pnpm --filter @powerfund/worker splits:reject -- --id=<uuid> --notes=<why>

Env:
  SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  TIINGO_API_KEY (optional; preferred for daily bars)

Vendors (free):
  bars: Tiingo → Yahoo chart → Stooq
  fundamentals: SEC companyfacts + Yahoo hole-fill
`);
}

/**
 * A split ingest noticed is half-handled by definition: the prices moved and
 * the book did not. Say so where a green run cannot hide it.
 */
function warnPendingSplits(pending: string[]) {
  if (pending.length === 0) return;
  console.warn(
    `[ingest:bars] ${pending.length} split(s) need the operator — the book is on the old share basis until applied:`,
  );
  for (const line of pending) console.warn(`[ingest:bars]   ${line}`);
  // Not a failure of this stage: the bars landed, and failing here would skip
  // the snapshot and the reconciliation behind it. `book:integrity` is what
  // turns the run red.
}

/** A failed latch is reported, but never stops the stages after it. */
async function latchAfterBars() {
  try {
    await latchReviewTriggers();
  } catch (error) {
    console.error("[reviews:latch] failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
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
    case "bars": {
      const bars = await ingestBars({ days, pauseMs, symbols });
      if (bars.rebased.length > 0) {
        console.warn(
          `[ingest:bars] re-based series refetched in full: ${bars.rebased.join(", ")}`,
        );
      }
      warnPendingSplits(bars.splitsPending);
      // Latch before anything else can fail: new closes are what fire a price
      // condition, and one that recovers before the next run is lost if a
      // later stage throws first.
      await latchAfterBars();
      const score = await scoreInflectionUniverse();
      if (score.failed.length > 0) process.exitCode = 1;
      break;
    }
    case "reviews:latch": {
      await latchReviewTriggers();
      break;
    }
    case "fundamentals": {
      const result = await ingestFundamentals({ pauseMs, symbols });
      console.log("[ingest:fundamentals]", JSON.stringify(result));
      if (result.failed.length > 0) process.exitCode = 1;
      const score = await scoreInflectionUniverse();
      if (score.failed.length > 0) process.exitCode = 1;
      break;
    }
    case "all": {
      const bars = await ingestBars({ days, pauseMs });
      if (bars.failed.length > 0) process.exitCode = 1;
      warnPendingSplits(bars.splitsPending);
      await latchAfterBars();
      const fundamentals = await ingestFundamentals({ pauseMs });
      console.log("[ingest:fundamentals]", JSON.stringify(fundamentals));
      if (fundamentals.failed.length > 0) process.exitCode = 1;
      const score = await scoreInflectionUniverse();
      if (score.failed.length > 0) process.exitCode = 1;
      break;
    }
    case "audit": {
      const result = await auditBars({
        thresholdPct: Number(readFlag("threshold", "35")),
        symbols,
      });
      printBarAudit(result);
      break;
    }
    case "freshness": {
      const result = await loadBarsFreshness();
      console.log("[bars:freshness]", JSON.stringify(result));
      // The gated retry in scheduled-ingest.yml reads this. It treats a missing
      // value as stale, so a failure here re-ingests rather than assuming the
      // store is current: a redundant pass costs two minutes, a skipped one
      // costs the morning briefing.
      const githubOutput = process.env.GITHUB_OUTPUT;
      if (githubOutput) {
        appendFileSync(githubOutput, `stale=${result.stale}\n`);
      }
      break;
    }
    case "verify:book": {
      const result = await verifyBookAgainstLedger();
      printBookVerification(result);
      // Both are hard failures. A drifted projection means the book on screen is
      // not the book in the ledger; a disabled guard means the ledger itself
      // stopped being immutable, which no later reconciliation would reveal.
      if (result.failed.length > 0 || result.guardsDisabled.length > 0) {
        process.exitCode = 1;
      }
      break;
    }
    case "book:integrity": {
      const result = await checkBookIntegrity();
      printBookIntegrity(result);
      // A share-basis problem is a hard failure for the same reason a ledger
      // mismatch is: NAV, drawdown and the kill-switch are read off these
      // marks, and a run that leaves them wrong by a split factor must not be
      // green. A late vendor is not: it is routine, the 05:07 retry exists for
      // it, and a run that is red most mornings teaches people to ignore red.
      const wrongBasis =
        result.basisMismatches.length > 0 ||
        result.pendingCorporateActions.some((row) => row.held);
      if (wrongBasis) process.exitCode = 1;
      break;
    }
    case "splits": {
      const rows = await listSplits();
      if (rows.length === 0) console.log("[splits] none registered");
      for (const row of rows) {
        console.log(
          `[splits] ${row.status.padEnd(8)} ${row.symbol.padEnd(6)} ${row.ratio.padEnd(10)} ` +
            `effective ${row.effectiveDate}  ${row.source.padEnd(12)} ${row.id}` +
            (row.verifiedBy ? `  verified by ${row.verifiedBy}` : ""),
        );
      }
      break;
    }
    case "splits:register": {
      const id = await registerSplit({
        symbol: readFlag("symbol", ""),
        effectiveDate: readFlag("effective", ""),
        ratio: readFlag("ratio", ""),
        notes: readFlag("notes", "") || undefined,
      });
      console.log(`[splits] registered pending ${id} — verify, then splits:apply`);
      break;
    }
    case "splits:apply": {
      const verifiedBy = readFlag("verifiedBy", "");
      const notes = readFlag("notes", "");
      if (!verifiedBy || !notes) {
        throw new Error("--verifiedBy and --notes are required: say who checked, and against what");
      }
      const applied = await applySplit({
        id: readFlag("id", ""),
        verifiedBy,
        notes,
        fractional: readFlag("fractional", "") || undefined,
      });
      console.log(
        applied
          ? "[splits] applied — run snapshot:portfolio to rebuild NAV history on the new basis"
          : "[splits] nothing applied: no pending corporate action with that id",
      );
      if (!applied) process.exitCode = 1;
      break;
    }
    case "splits:reject": {
      const notes = readFlag("notes", "");
      if (!notes) throw new Error("--notes is required: say why it is not a split");
      const rejected = await rejectSplit({ id: readFlag("id", ""), notes });
      console.log(
        rejected
          ? "[splits] rejected"
          : "[splits] nothing rejected: no pending corporate action with that id",
      );
      if (!rejected) process.exitCode = 1;
      break;
    }
    case "score": {
      const asOf = readFlag("asOf", "");
      const score = await scoreInflectionUniverse(
        asOf ? { asOf } : undefined,
      );
      if (score.failed.length > 0) process.exitCode = 1;
      break;
    }
    case "replay": {
      const result = await replayInflection({
        from: readFlag("from", "") || undefined,
        to: readFlag("to", "") || undefined,
        everyNSessions: Number(readFlag("every", "21")),
        symbols,
        includeStale: process.argv.includes("--includeStale"),
      });
      printReplay(result);
      break;
    }
    case "snapshot": {
      const result = await snapshotPortfolio();
      console.log("[snapshot:portfolio]", JSON.stringify(result));
      if (result.alignmentIssues.length > 0) process.exitCode = 1;
      break;
    }
    case "snapshot:verify": {
      const result = await snapshotPortfolio({ dryRun: true });
      console.log("[snapshot:verify]", JSON.stringify(result, null, 2));
      if (result.alignmentIssues.length > 0) process.exitCode = 1;
      break;
    }
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
