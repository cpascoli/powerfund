import { findSeriesDiscontinuities, type StoredClose } from "@powerfund/domain";

import { createAdminDb, listWatchInstruments } from "../db";

/**
 * Scan stored price series for jumps a split would leave behind.
 *
 * Detection on ingest stops new damage, but a split that landed before that
 * existed is outside the refresh window forever — the nightly job compares only
 * the last few days, so an old boundary is never revisited. This finds those,
 * so they can be repaired with a wide `ingest:bars --symbols=…`.
 *
 * A large single-session move is not proof: a recent listing, an earnings gap
 * or a genuine crash all look like this. The output is a list to check, not a
 * verdict — but a move landing near a round factor (0.5, 2, 0.1, 10) is the
 * shape of a split rather than a market.
 */

const ROUND_FACTORS = [0.1, 0.2, 0.25, 1 / 3, 0.5, 2, 3, 4, 5, 10];

function nearestSplitFactor(changePct: number): number | null {
  const ratio = 1 + changePct / 100;
  for (const factor of ROUND_FACTORS) {
    if (Math.abs(ratio / factor - 1) <= 0.02) return factor;
  }
  return null;
}

export type BarAuditResult = {
  instruments: number;
  flagged: Array<{
    symbol: string;
    held: boolean;
    date: string;
    previousClose: number;
    close: number;
    changePct: number;
    splitFactor: number | null;
  }>;
};

export async function auditBars(options?: {
  thresholdPct?: number;
  symbols?: string[];
}): Promise<BarAuditResult> {
  const db = createAdminDb();
  const wanted = options?.symbols?.map((symbol) => symbol.toUpperCase()) ?? [];
  const instruments = (await listWatchInstruments(db)).filter(
    (instrument) =>
      wanted.length === 0 || wanted.includes(instrument.symbol.toUpperCase()),
  );

  const { data: openPositions } = await db
    .from("positions")
    .select("instrument_id")
    .eq("status", "open");
  const heldIds = new Set(
    ((openPositions as Array<{ instrument_id: string }> | null) ?? []).map(
      (row) => row.instrument_id,
    ),
  );

  const flagged: BarAuditResult["flagged"] = [];

  for (const instrument of instruments) {
    const closes: StoredClose[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db
        .from("market_bars")
        .select("bar_date, close")
        .eq("instrument_id", instrument.id)
        .order("bar_date", { ascending: true })
        .range(from, from + 999);
      if (error) throw new Error(`${instrument.symbol}: ${error.message}`);
      const page =
        (data as Array<{ bar_date: string; close: number | null }> | null) ?? [];
      for (const row of page) {
        if (row.close == null) continue;
        closes.push({ date: row.bar_date, close: Number(row.close) });
      }
      if (page.length < 1000) break;
    }

    for (const jump of findSeriesDiscontinuities(closes, {
      thresholdPct: options?.thresholdPct,
    })) {
      flagged.push({
        symbol: instrument.symbol,
        held: heldIds.has(instrument.id),
        ...jump,
        splitFactor: nearestSplitFactor(jump.changePct),
      });
    }
  }

  flagged.sort((a, b) => {
    if (a.held !== b.held) return a.held ? -1 : 1;
    const aSplit = a.splitFactor != null;
    const bSplit = b.splitFactor != null;
    if (aSplit !== bSplit) return aSplit ? -1 : 1;
    return a.date < b.date ? -1 : 1;
  });

  return { instruments: instruments.length, flagged };
}

export function printBarAudit(result: BarAuditResult): void {
  console.log(
    `\n[bars:audit] ${result.instruments} instruments · ${result.flagged.length} session(s) to check\n`,
  );
  if (result.flagged.length === 0) {
    console.log("No discontinuities above the threshold.");
    return;
  }
  console.log(
    `${"sym".padEnd(7)}${"held".padEnd(6)}${"date".padEnd(12)}` +
      `${"from".padStart(11)}${"to".padStart(11)}${"change".padStart(10)}  likely split`,
  );
  for (const row of result.flagged) {
    console.log(
      `${row.symbol.padEnd(7)}${(row.held ? "HELD" : "").padEnd(6)}${row.date.padEnd(12)}` +
        `${row.previousClose.toFixed(2).padStart(11)}${row.close.toFixed(2).padStart(11)}` +
        `${`${row.changePct.toFixed(1)}%`.padStart(10)}  ` +
        `${row.splitFactor == null ? "—" : `${row.splitFactor}x`}`,
    );
  }
  console.log(
    "\nA large move is not proof — listings, earnings gaps and crashes look the " +
      "same. One landing on a round factor is the shape of a split. Repair with " +
      "`ingest:bars -- --days=1900 --symbols=SYM`.",
  );
}
