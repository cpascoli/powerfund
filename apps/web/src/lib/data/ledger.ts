import type { Database } from "@powerfund/db";

import { resolveDb, type DbClient } from "@/lib/supabase/db";

type TransactionKind = Database["public"]["Enums"]["transaction_kind"];

export type LedgerEntry = {
  id: string;
  occurredAt: string;
  kind: TransactionKind;
  symbol: string | null;
  quantity: number | null;
  price: number | null;
  cashDelta: number;
  realizedPnl: number | null;
  notes: string | null;
  source: string;
};

export type LedgerSummary = {
  entries: LedgerEntry[];
  realizedPnl: number;
  depositedCapital: number;
  entryCount: number;
};

/**
 * The ledger is what makes the book auditable, so the portfolio page shows it
 * rather than only the balances derived from it.
 */
export async function getLedgerSummary(
  limit = 12,
  client?: DbClient,
): Promise<LedgerSummary> {
  const supabase = await resolveDb(client);

  const [{ data: recent, error: recentError }, { data: all, error: allError }] =
    await Promise.all([
      supabase
        .from("transactions")
        .select(
          "id, occurred_at, kind, quantity, price, cash_delta, realized_pnl, notes, source, instruments(symbol)",
        )
        .order("occurred_at", { ascending: false })
        .limit(limit),
      supabase.from("transactions").select("kind, cash_delta, realized_pnl"),
    ]);

  if (recentError) {
    throw new Error(`Failed to load the ledger: ${recentError.message}`);
  }
  if (allError) {
    throw new Error(`Failed to summarise the ledger: ${allError.message}`);
  }

  const totals = all ?? [];
  const realizedPnl = totals.reduce(
    (sum, row) => sum + Number(row.realized_pnl ?? 0),
    0,
  );
  const depositedCapital = totals.reduce((sum, row) => {
    if (row.kind !== "deposit" && row.kind !== "withdrawal") return sum;
    return sum + Number(row.cash_delta);
  }, 0);

  const entries: LedgerEntry[] = (recent ?? []).map((row) => ({
    id: row.id,
    occurredAt: row.occurred_at,
    kind: row.kind,
    symbol: row.instruments?.symbol ?? null,
    quantity: row.quantity == null ? null : Number(row.quantity),
    price: row.price == null ? null : Number(row.price),
    cashDelta: Number(row.cash_delta),
    realizedPnl: row.realized_pnl == null ? null : Number(row.realized_pnl),
    notes: row.notes,
    source: row.source,
  }));

  return {
    entries,
    realizedPnl,
    depositedCapital,
    entryCount: totals.length,
  };
}
