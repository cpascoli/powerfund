import {
  accumulateLedgerFlows,
  buildPerformancePoints,
  drawdownFromPeakPct,
  lastCompletedCashSession,
  maxDrawdownPct,
  reconstructSnapshots,
  snapshotAlignmentIssues,
  unitizedDeployedIndex,
  type LedgerEntry,
  type PerformancePoint,
  type ReconstructedSnapshot,
  type SnapshotAlignmentIssue,
} from "@powerfund/domain";

import { createAdminDb, type AdminDb } from "../db";

export type SnapshotPortfolioResult = {
  /** Last session written. */
  session: string | null;
  sessions: number;
  written: string[];
  removed: string[];
  nav: number | null;
  cash: number | null;
  invested: number | null;
  positionsValue: number | null;
  /** Sessions where at least one holding could not be marked from its own bar. */
  staleSessions: Array<{ session: string; symbols: string[] }>;
  alignmentIssues: SnapshotAlignmentIssue[];
  /** Unitized deployed-sleeve drawdown from peak, percent. */
  deployedDrawdownPct: number | null;
  deployedMaxDrawdownPct: number | null;
  deployedReturnPct: number | null;
};

type LedgerRow = {
  occurred_at: string;
  kind: LedgerEntry["kind"];
  instrument_id: string | null;
  quantity: number | null;
  cash_delta: number;
  basis_delta: number | null;
};

type BarRow = {
  instrument_id: string;
  bar_date: string;
  close: number | null;
  adj_close: number | null;
};

/**
 * NAV marks, one row per US cash session.
 *
 * The session — not the moment the job happens to run — is the key. `as_of` is
 * stamped at that session's evening so the generated `snapshot_date` can only
 * ever be the session being marked, and a position may only be marked with a bar
 * dated that same session. When the scheduler runs late (GitHub Actions routinely
 * slips past midnight UTC), this recomputes the session it missed instead of
 * labelling yesterday's closes with today's date.
 *
 * The whole series is rebuilt from the ledger and stored bars on every run. That
 * is deterministic, cheap at this size, and means a late run, a re-run, or a
 * backdated fill all converge on the same answer rather than leaving a wrong row
 * behind that nothing ever overwrites.
 */
export async function snapshotPortfolio(options?: {
  /** Report what would change without writing. */
  dryRun?: boolean;
  now?: Date;
}): Promise<SnapshotPortfolioResult> {
  const db = createAdminDb();
  const now = options?.now ?? new Date();

  const [
    { data: txData, error: txError },
    { data: existingData, error: existingError },
    { data: benchmarkData, error: benchmarkError },
  ] = await Promise.all([
    db
      .from("transactions")
      .select("occurred_at, kind, instrument_id, quantity, cash_delta, basis_delta")
      .order("occurred_at", { ascending: true }),
    db.from("portfolio_snapshots").select("id, snapshot_date"),
    db.from("benchmarks").select("instrument_id").eq("role", "success").maybeSingle(),
  ]);

  if (txError) throw new Error(`Failed to load ledger: ${txError.message}`);
  if (existingError) {
    throw new Error(`Failed to load snapshots: ${existingError.message}`);
  }
  if (benchmarkError) {
    throw new Error(`Failed to load benchmark: ${benchmarkError.message}`);
  }

  const entries: LedgerEntry[] = ((txData as LedgerRow[] | null) ?? []).map(
    (row) => ({
      occurredAt: row.occurred_at,
      kind: row.kind,
      instrumentId: row.instrument_id,
      quantity: row.quantity == null ? null : Number(row.quantity),
      cashDelta: Number(row.cash_delta),
      basisDelta: row.basis_delta == null ? null : Number(row.basis_delta),
    }),
  );

  const empty: SnapshotPortfolioResult = {
    session: null,
    sessions: 0,
    written: [],
    removed: [],
    nav: null,
    cash: null,
    invested: null,
    positionsValue: null,
    staleSessions: [],
    alignmentIssues: [],
    deployedDrawdownPct: null,
    deployedMaxDrawdownPct: null,
    deployedReturnPct: null,
  };
  if (entries.length === 0) return empty;

  const firstDay = entries[0]?.occurredAt.slice(0, 10) ?? null;
  if (firstDay == null) return empty;

  const successId = (benchmarkData as { instrument_id: string } | null)
    ?.instrument_id;
  if (successId == null) {
    throw new Error(
      "No success benchmark is configured — SPY bars are the trading calendar.",
    );
  }

  // SPY's bars are the trading calendar: they carry exchange holidays that a
  // weekday rule cannot know about, and they only exist once ingest has run.
  const { data: calendarData, error: calendarError } = await db
    .from("market_bars")
    .select("bar_date")
    .eq("instrument_id", successId)
    .gte("bar_date", firstDay)
    .order("bar_date", { ascending: true });
  if (calendarError) {
    throw new Error(`Failed to load the SPY calendar: ${calendarError.message}`);
  }

  // Never mark a session that has not closed yet, even if a vendor already
  // published a partial bar for it.
  const throughSession = lastCompletedCashSession(now.toISOString());
  const sessions = ((calendarData as Array<{ bar_date: string }> | null) ?? [])
    .map((row) => row.bar_date)
    .filter((date) => date <= throughSession);
  if (sessions.length === 0) return empty;

  const instrumentIds = [
    ...new Set(
      entries
        .map((row) => row.instrumentId)
        .filter((value): value is string => value != null),
    ),
  ];

  const [{ data: barData, error: barError }, { data: instrumentData }, { data: links }] =
    await Promise.all([
      db
        .from("market_bars")
        .select("instrument_id, bar_date, close, adj_close")
        .in("instrument_id", instrumentIds)
        .gte("bar_date", firstDay)
        .order("bar_date", { ascending: true }),
      db.from("instruments").select("id, symbol").in("id", instrumentIds),
      db
        .from("instrument_themes")
        .select("instrument_id, is_primary, themes(slug)")
        .in("instrument_id", instrumentIds),
    ]);
  if (barError) throw new Error(`Failed to load bars: ${barError.message}`);

  const symbolById = new Map(
    ((instrumentData as Array<{ id: string; symbol: string }> | null) ?? []).map(
      (row) => [row.id, row.symbol],
    ),
  );
  const themeByInstrument = new Map<string, string>();
  for (const link of (links as Array<{
    instrument_id: string;
    is_primary: boolean;
    themes: { slug: string } | Array<{ slug: string }> | null;
  }> | null) ?? []) {
    const theme = Array.isArray(link.themes) ? link.themes[0] : link.themes;
    if (!theme) continue;
    if (link.is_primary || !themeByInstrument.has(link.instrument_id)) {
      themeByInstrument.set(link.instrument_id, theme.slug);
    }
  }

  // session → instrument → close, plus an ordered history per instrument so a
  // missing bar can carry forward instead of snapping back to cost.
  const closes = new Map<string, Map<string, number>>();
  const history = new Map<string, Array<{ date: string; close: number }>>();
  for (const row of (barData as BarRow[] | null) ?? []) {
    const close = row.adj_close ?? row.close;
    if (close == null) continue;
    const value = Number(close);
    const bySession = closes.get(row.bar_date) ?? new Map<string, number>();
    bySession.set(row.instrument_id, value);
    closes.set(row.bar_date, bySession);
    const list = history.get(row.instrument_id) ?? [];
    list.push({ date: row.bar_date, close: value });
    history.set(row.instrument_id, list);
  }

  const priorClose = (
    instrumentId: string,
    session: string,
  ): { close: number; date: string } | null => {
    const list = history.get(instrumentId);
    if (list == null) return null;
    let hit: { date: string; close: number } | null = null;
    for (const bar of list) {
      if (bar.date >= session) break;
      hit = bar;
    }
    return hit;
  };

  const rebuilt = reconstructSnapshots({
    entries,
    sessions,
    closes,
    priorClose,
  });
  const alignmentIssues = snapshotAlignmentIssues(rebuilt);

  const staleSessions = rebuilt
    .filter((row) => row.staleMarks.length > 0)
    .map((row) => ({
      session: row.session,
      symbols: row.staleMarks.map((id) => symbolById.get(id) ?? id),
    }));

  // Same flow bucketing and point assembly the app uses, so the number this job
  // reports and the number /api/v1/performance publishes come from one code path.
  const flows = accumulateLedgerFlows(
    entries.map((entry) => ({
      occurredAt: entry.occurredAt,
      kind: entry.kind,
      cashDelta: entry.cashDelta,
    })),
  );
  const points: PerformancePoint[] = buildPerformancePoints(
    rebuilt.map((row) => ({
      date: row.session,
      nav: row.nav,
      invested: row.invested,
      positionsValue: row.positionsValue,
    })),
    flows,
  );
  const index = unitizedDeployedIndex(points);
  const last = index.at(-1) ?? null;

  const latest = rebuilt.at(-1) ?? null;
  const result: SnapshotPortfolioResult = {
    session: latest?.session ?? null,
    sessions: rebuilt.length,
    written: [],
    removed: [],
    nav: latest?.nav ?? null,
    cash: latest?.cash ?? null,
    invested: latest?.invested ?? null,
    positionsValue: latest?.positionsValue ?? null,
    staleSessions,
    alignmentIssues,
    deployedDrawdownPct: drawdownFromPeakPct(index),
    deployedMaxDrawdownPct: maxDrawdownPct(index),
    deployedReturnPct: last == null ? null : (last - 1) * 100,
  };

  if (options?.dryRun) {
    result.written = rebuilt.map((row) => row.session);
    return result;
  }

  const rows = rebuilt.map((row) => toSnapshotRow(row, symbolById, themeByInstrument));
  const { error: upsertError } = await db
    .from("portfolio_snapshots")
    .upsert(rows, { onConflict: "snapshot_date" });
  if (upsertError) {
    throw new Error(`Failed to write snapshots: ${upsertError.message}`);
  }
  result.written = rebuilt.map((row) => row.session);

  // Rows stamped on a non-session (a weekend, a holiday, or a late run that
  // landed on the following calendar day) are not marks of anything.
  const keep = new Set(sessions);
  const orphans = (
    (existingData as Array<{ id: string; snapshot_date: string | null }> | null) ??
    []
  ).filter((row) => row.snapshot_date != null && !keep.has(row.snapshot_date));
  if (orphans.length > 0) {
    const { error: deleteError } = await db
      .from("portfolio_snapshots")
      .delete()
      .in(
        "id",
        orphans.map((row) => row.id),
      );
    if (deleteError) {
      throw new Error(`Failed to drop off-session snapshots: ${deleteError.message}`);
    }
    result.removed = orphans
      .map((row) => row.snapshot_date)
      .filter((value): value is string => value != null);
  }

  return result;
}

function toSnapshotRow(
  snapshot: ReconstructedSnapshot,
  symbolById: Map<string, string>,
  themeByInstrument: Map<string, string>,
) {
  const themes = new Map<string, number>();
  for (const position of snapshot.positions) {
    const slug = themeByInstrument.get(position.instrumentId) ?? "other";
    themes.set(slug, (themes.get(slug) ?? 0) + position.value);
  }
  const stale = snapshot.staleMarks.map((id) => symbolById.get(id) ?? id);
  return {
    // 22:30 UTC is after the 16:00 ET close on both standard and daylight time,
    // so the generated snapshot_date is always this session.
    as_of: `${snapshot.session}T22:30:00.000Z`,
    nav: snapshot.nav,
    cash: snapshot.cash,
    invested: snapshot.invested,
    positions_value: snapshot.positionsValue,
    exposures: {
      session: snapshot.session,
      positions: snapshot.positions.map((position) => ({
        symbol: symbolById.get(position.instrumentId) ?? position.instrumentId,
        quantity: position.quantity,
        invested: position.invested,
        close: position.close,
        closeDate: position.closeDate,
        value: position.value,
      })),
      themes: Object.fromEntries(themes),
      staleMarks: stale,
    },
    notes:
      stale.length > 0
        ? `No bar for this session: ${stale.join(", ")} — carried from the prior close`
        : null,
  };
}
