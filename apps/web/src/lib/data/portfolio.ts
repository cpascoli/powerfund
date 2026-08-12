import { createClient } from "@/lib/supabase/server";

export type OpenPositionRow = {
  id: string;
  instrumentId: string;
  symbol: string;
  name: string;
  themeName: string;
  side: "long" | "short";
  quantity: number;
  avgCost: number;
  costBasis: number;
  lastClose: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPct: number | null;
  openedAt: string;
  thesisSummary: string | null;
};

export type PortfolioBook = {
  positions: OpenPositionRow[];
  invested: number;
  marketValue: number;
  unrealizedPnl: number;
  openCount: number;
};

type PositionDbRow = {
  id: string;
  instrument_id: string;
  side: "long" | "short";
  quantity: number;
  avg_cost: number;
  opened_at: string;
  thesis_summary: string | null;
};

export async function getOpenPortfolioBook(): Promise<PortfolioBook> {
  const supabase = await createClient();

  const { data: positionData, error: positionError } = await supabase
    .from("positions")
    .select(
      "id, instrument_id, side, quantity, avg_cost, opened_at, thesis_summary",
    )
    .eq("status", "open")
    .order("opened_at", { ascending: false });

  if (positionError) {
    throw new Error(`Failed to load positions: ${positionError.message}`);
  }

  const positions = (positionData as PositionDbRow[] | null) ?? [];
  if (positions.length === 0) {
    return {
      positions: [],
      invested: 0,
      marketValue: 0,
      unrealizedPnl: 0,
      openCount: 0,
    };
  }

  const instrumentIds = [...new Set(positions.map((row) => row.instrument_id))];

  const [{ data: instruments, error: instrumentError }, { data: links }] =
    await Promise.all([
      supabase
        .from("instruments")
        .select("id, symbol, name")
        .in("id", instrumentIds),
      supabase
        .from("instrument_themes")
        .select("instrument_id, theme_id, is_primary")
        .in("instrument_id", instrumentIds),
    ]);

  if (instrumentError) {
    throw new Error(`Failed to load instruments: ${instrumentError.message}`);
  }

  const themeIds = [
    ...new Set(
      ((links as Array<{ theme_id: string }> | null) ?? []).map(
        (row) => row.theme_id,
      ),
    ),
  ];
  const { data: themes } = themeIds.length
    ? await supabase.from("themes").select("id, name").in("id", themeIds)
    : { data: [] as Array<{ id: string; name: string }> };

  const instrumentMap = new Map(
    ((instruments as Array<{
      id: string;
      symbol: string;
      name: string;
    }> | null) ?? []).map((row) => [row.id, row]),
  );
  const themeMap = new Map(
    ((themes as Array<{ id: string; name: string }> | null) ?? []).map(
      (row) => [row.id, row.name],
    ),
  );
  const primaryThemeByInstrument = new Map<string, string>();
  for (const link of (links as Array<{
    instrument_id: string;
    theme_id: string;
    is_primary: boolean;
  }> | null) ?? []) {
    if (link.is_primary || !primaryThemeByInstrument.has(link.instrument_id)) {
      primaryThemeByInstrument.set(
        link.instrument_id,
        themeMap.get(link.theme_id) ?? "—",
      );
    }
  }

  const closes = await Promise.all(
    instrumentIds.map(async (instrumentId) => {
      const { data } = await supabase
        .from("market_bars")
        .select("close, adj_close")
        .eq("instrument_id", instrumentId)
        .order("bar_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      const bar = data as {
        close: number | null;
        adj_close: number | null;
      } | null;
      return [instrumentId, bar?.adj_close ?? bar?.close ?? null] as const;
    }),
  );
  const closeMap = new Map(closes);

  const rows: OpenPositionRow[] = positions.map((position) => {
    const instrument = instrumentMap.get(position.instrument_id);
    const quantity = Number(position.quantity);
    const avgCost = Number(position.avg_cost);
    const costBasis = quantity * avgCost;
    const lastClose = closeMap.get(position.instrument_id) ?? null;
    const marketValue = lastClose == null ? null : quantity * lastClose;
    const unrealizedPnl =
      marketValue == null ? null : marketValue - costBasis;
    const unrealizedPnlPct =
      unrealizedPnl == null || costBasis === 0
        ? null
        : (unrealizedPnl / costBasis) * 100;

    return {
      id: position.id,
      instrumentId: position.instrument_id,
      symbol: instrument?.symbol ?? "—",
      name: instrument?.name ?? "Unknown",
      themeName: primaryThemeByInstrument.get(position.instrument_id) ?? "—",
      side: position.side,
      quantity,
      avgCost,
      costBasis,
      lastClose,
      marketValue,
      unrealizedPnl,
      unrealizedPnlPct,
      openedAt: position.opened_at,
      thesisSummary: position.thesis_summary,
    };
  });

  const invested = rows.reduce((sum, row) => sum + row.costBasis, 0);
  const marketValue = rows.reduce(
    (sum, row) => sum + (row.marketValue ?? row.costBasis),
    0,
  );

  return {
    positions: rows,
    invested,
    marketValue,
    unrealizedPnl: marketValue - invested,
    openCount: rows.length,
  };
}
