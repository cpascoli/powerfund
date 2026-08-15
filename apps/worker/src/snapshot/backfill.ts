import type { AdminDb } from "../db";

type LedgerRow = {
  occurred_at: string;
  kind: string;
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

function utcDay(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function closeOnOrBefore(
  bars: Array<{ date: string; close: number }>,
  date: string,
): number | null {
  let close: number | null = null;
  for (const bar of bars) {
    if (bar.date <= date) close = bar.close;
    else break;
  }
  return close;
}

/**
 * Write reconstructed NAV marks for trading days that the nightly job missed.
 * Does not overwrite an existing snapshot — those are the official EOD marks.
 */
export async function backfillMissingSnapshots(
  db: AdminDb,
): Promise<{ written: string[] }> {
  const [
    { data: txData, error: txError },
    { data: existingData, error: existingError },
  ] = await Promise.all([
    db
      .from("transactions")
      .select("occurred_at, kind, instrument_id, quantity, cash_delta, basis_delta")
      .order("occurred_at", { ascending: true }),
    db.from("portfolio_snapshots").select("snapshot_date"),
  ]);
  if (txError) {
    throw new Error(`Failed to load ledger for backfill: ${txError.message}`);
  }
  if (existingError) {
    throw new Error(`Failed to load snapshots: ${existingError.message}`);
  }

  const txs = (txData as LedgerRow[] | null) ?? [];
  if (txs.length === 0) return { written: [] };

  const existing = new Set(
    ((existingData as Array<{ snapshot_date: string | null }> | null) ?? [])
      .map((row) => row.snapshot_date)
      .filter((value): value is string => value != null),
  );

  const instrumentIds = [
    ...new Set(
      txs
        .map((row) => row.instrument_id)
        .filter((value): value is string => value != null),
    ),
  ];
  if (instrumentIds.length === 0) return { written: [] };

  const startDate = utcDay(txs[0]?.occurred_at ?? todayUtc());
  const [{ data: barData, error: barError }, { data: instrumentData }, { data: calendarData }] =
    await Promise.all([
      db
        .from("market_bars")
        .select("instrument_id, bar_date, close, adj_close")
        .in("instrument_id", instrumentIds)
        .gte("bar_date", startDate)
        .order("bar_date", { ascending: true }),
      db.from("instruments").select("id, symbol").in("id", instrumentIds),
      db
        .from("benchmarks")
        .select("instrument_id")
        .eq("role", "success")
        .maybeSingle(),
    ]);
  if (barError) {
    throw new Error(`Failed to load bars for backfill: ${barError.message}`);
  }

  const symbolById = new Map(
    ((instrumentData as Array<{ id: string; symbol: string }> | null) ?? []).map(
      (row) => [row.id, row.symbol],
    ),
  );
  const barsByInstrument = new Map<
    string,
    Array<{ date: string; close: number }>
  >();
  const holdingDays = new Set<string>();
  for (const row of (barData as BarRow[] | null) ?? []) {
    const close = row.adj_close ?? row.close;
    if (close == null) continue;
    const list = barsByInstrument.get(row.instrument_id) ?? [];
    list.push({ date: row.bar_date, close: Number(close) });
    barsByInstrument.set(row.instrument_id, list);
    holdingDays.add(row.bar_date);
  }

  const successId = (calendarData as { instrument_id: string } | null)
    ?.instrument_id;
  let tradingDays = holdingDays;
  if (successId) {
    const { data: spyBars, error: spyError } = await db
      .from("market_bars")
      .select("bar_date")
      .eq("instrument_id", successId)
      .gte("bar_date", startDate)
      .order("bar_date", { ascending: true });
    if (spyError) {
      throw new Error(`Failed to load SPY calendar: ${spyError.message}`);
    }
    const spyDays = new Set(
      ((spyBars as Array<{ bar_date: string }> | null) ?? []).map(
        (row) => row.bar_date,
      ),
    );
    if (spyDays.size > 0) tradingDays = spyDays;
  }

  const today = todayUtc();
  const dates = [...tradingDays].sort().filter((date) => date < today);
  const written: string[] = [];

  for (const date of dates) {
    if (existing.has(date)) continue;

    const included = txs.filter((row) => utcDay(row.occurred_at) <= date);
    const cash = included.reduce((sum, row) => sum + Number(row.cash_delta), 0);
    const qty = new Map<string, { quantity: number; invested: number }>();
    for (const row of included) {
      if (row.instrument_id == null) continue;
      if (row.kind !== "buy" && row.kind !== "sell") continue;
      const current = qty.get(row.instrument_id) ?? {
        quantity: 0,
        invested: 0,
      };
      const signedQty =
        row.kind === "buy"
          ? Number(row.quantity ?? 0)
          : -Number(row.quantity ?? 0);
      current.quantity += signedQty;
      current.invested += Number(row.basis_delta ?? 0);
      qty.set(row.instrument_id, current);
    }

    let invested = 0;
    let positionsValue = 0;
    const staleMarks: string[] = [];
    const positionExposures: Array<{
      symbol: string;
      quantity: number;
      value: number;
    }> = [];

    for (const [instrumentId, position] of qty) {
      if (position.quantity <= 0) continue;
      invested += position.invested;
      const close = closeOnOrBefore(
        barsByInstrument.get(instrumentId) ?? [],
        date,
      );
      const symbol = symbolById.get(instrumentId) ?? instrumentId;
      const value =
        close == null ? position.invested : position.quantity * close;
      if (close == null) staleMarks.push(symbol);
      positionsValue += value;
      positionExposures.push({
        symbol,
        quantity: position.quantity,
        value,
      });
    }

    const { error: upsertError } = await db.from("portfolio_snapshots").upsert(
      {
        as_of: `${date}T22:30:00.000Z`,
        nav: cash + positionsValue,
        cash,
        invested,
        positions_value: positionsValue,
        exposures: { reconstructed: true, positions: positionExposures },
        notes:
          staleMarks.length > 0
            ? `Reconstructed; marked at cost: ${staleMarks.join(", ")}`
            : "Reconstructed from the ledger and stored closes",
      },
      { onConflict: "snapshot_date" },
    );
    if (upsertError) {
      throw new Error(`Failed to backfill ${date}: ${upsertError.message}`);
    }
    written.push(date);
  }

  return { written };
}
