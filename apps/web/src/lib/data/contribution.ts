import {
  INCEPTION_DATE,
  contributionFromLedger,
  utcDay,
  type ContributionReport,
  type HoldingInstrument,
  type HoldingLedgerRow,
  type PriceBar,
} from "@powerfund/domain";
import type { Database } from "@powerfund/db";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { PerformanceRange } from "@/lib/data/performance";

type Db = SupabaseClient<Database>;
type TransactionKind = Database["public"]["Enums"]["transaction_kind"];

type TxRow = {
  occurred_at: string;
  kind: TransactionKind;
  instrument_id: string | null;
  quantity: number | null;
  cash_delta: number;
  realized_pnl: number | null;
};

type BarRow = {
  instrument_id: string;
  bar_date: string;
  close: number | null;
  adj_close: number | null;
};

type ThemeLink = {
  instrument_id: string;
  theme_id: string;
  is_primary: boolean;
};

export function resolvedContributionRange(
  range: PerformanceRange | undefined,
  asOf: string,
): { from: string; to: string } {
  return {
    from: range?.from ?? INCEPTION_DATE,
    to: range?.to ?? utcDay(asOf),
  };
}

export async function loadContributionReport(
  db: Db,
  range: { from: string; to: string },
): Promise<ContributionReport> {
  const { data: txData, error: txError } = await db
    .from("transactions")
    .select("occurred_at, kind, instrument_id, quantity, cash_delta, realized_pnl")
    .order("occurred_at", { ascending: true });
  if (txError) {
    throw new Error(`Failed to load ledger for contribution: ${txError.message}`);
  }

  const ledger: HoldingLedgerRow[] = ((txData as TxRow[] | null) ?? []).map(
    (row) => ({
      occurredAt: row.occurred_at,
      kind: row.kind,
      instrumentId: row.instrument_id,
      quantity: row.quantity == null ? null : Number(row.quantity),
      cashDelta: Number(row.cash_delta),
      realizedPnl: row.realized_pnl == null ? null : Number(row.realized_pnl),
    }),
  );

  const instrumentIds = [
    ...new Set(
      ledger
        .map((row) => row.instrumentId)
        .filter((id): id is string => id != null),
    ),
  ];
  if (instrumentIds.length === 0) {
    return contributionFromLedger({
      from: range.from,
      to: range.to,
      tradingDays: [],
      ledger,
      instruments: [],
      bars: [],
    });
  }

  const startDate = utcDay(ledger[0]?.occurredAt ?? range.from);

  const [
    { data: instrumentData, error: instrumentError },
    { data: linkData, error: linkError },
    { data: barData, error: barError },
    { data: benchmarkData, error: benchmarkError },
  ] = await Promise.all([
    db.from("instruments").select("id, symbol").in("id", instrumentIds),
    db
      .from("instrument_themes")
      .select("instrument_id, theme_id, is_primary")
      .in("instrument_id", instrumentIds),
    db
      .from("market_bars")
      .select("instrument_id, bar_date, close, adj_close")
      .in("instrument_id", instrumentIds)
      .gte("bar_date", startDate)
      .lte("bar_date", range.to)
      .order("bar_date", { ascending: true }),
    db.from("benchmarks").select("instrument_id").eq("role", "success").maybeSingle(),
  ]);
  if (instrumentError) {
    throw new Error(`Failed to load instruments: ${instrumentError.message}`);
  }
  if (linkError) {
    throw new Error(`Failed to load themes: ${linkError.message}`);
  }
  if (barError) {
    throw new Error(`Failed to load bars: ${barError.message}`);
  }
  if (benchmarkError) {
    throw new Error(`Failed to load SPY calendar: ${benchmarkError.message}`);
  }

  const links = (linkData as ThemeLink[] | null) ?? [];
  const themeIds = [...new Set(links.map((row) => row.theme_id))];
  const { data: themeData, error: themeError } = themeIds.length
    ? await db.from("themes").select("id, slug, name").in("id", themeIds)
    : { data: [] as Array<{ id: string; slug: string; name: string }>, error: null };
  if (themeError) {
    throw new Error(`Failed to load theme names: ${themeError.message}`);
  }
  const themeById = new Map(
    ((themeData as Array<{ id: string; slug: string; name: string }> | null) ??
      []).map((row) => [row.id, row]),
  );
  const primaryByInstrument = new Map<string, { slug: string; name: string }>();
  for (const link of links) {
    const theme = themeById.get(link.theme_id);
    if (!theme) continue;
    if (link.is_primary || !primaryByInstrument.has(link.instrument_id)) {
      primaryByInstrument.set(link.instrument_id, {
        slug: theme.slug,
        name: theme.name,
      });
    }
  }
  const instruments: HoldingInstrument[] = (
    (instrumentData as Array<{ id: string; symbol: string }> | null) ?? []
  ).map((row) => {
    const theme = primaryByInstrument.get(row.id);
    return {
      id: row.id,
      symbol: row.symbol,
      themeSlug: theme?.slug ?? "other",
      themeName: theme?.name ?? "Other",
    };
  });

  const bars: PriceBar[] = [];
  const holdingDays = new Set<string>();
  for (const row of (barData as BarRow[] | null) ?? []) {
    const close = row.adj_close ?? row.close;
    if (close == null) continue;
    bars.push({
      instrumentId: row.instrument_id,
      date: row.bar_date,
      close: Number(close),
    });
    holdingDays.add(row.bar_date);
  }

  let tradingDays = [...holdingDays].sort();
  const spyId = (benchmarkData as { instrument_id: string } | null)?.instrument_id;
  if (spyId) {
    const { data: spyBars, error: spyError } = await db
      .from("market_bars")
      .select("bar_date")
      .eq("instrument_id", spyId)
      .gte("bar_date", startDate)
      .lte("bar_date", range.to)
      .order("bar_date", { ascending: true });
    if (spyError) {
      throw new Error(`Failed to load SPY bars: ${spyError.message}`);
    }
    const spyDays = ((spyBars as Array<{ bar_date: string }> | null) ?? []).map(
      (row) => row.bar_date,
    );
    if (spyDays.length > 0) tradingDays = spyDays;
  }

  return contributionFromLedger({
    from: range.from,
    to: range.to,
    tradingDays,
    ledger,
    instruments,
    bars,
  });
}
