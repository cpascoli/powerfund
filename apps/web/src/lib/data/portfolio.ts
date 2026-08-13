import { RISK_DEFAULTS } from "@powerfund/domain";
import { fetchYahooQuotes, type LiveQuote } from "@powerfund/data-clients";

import { createClient } from "@/lib/supabase/server";

export type OpenPositionRow = {
  id: string;
  instrumentId: string;
  symbol: string;
  name: string;
  themeName: string;
  themeSlug: string;
  side: "long" | "short";
  quantity: number;
  avgCost: number;
  costBasis: number;
  lastClose: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPct: number | null;
  weightPctNav: number | null;
  priceSource: "live" | "close";
  openedAt: string;
  thesisSummary: string | null;
  invalidation: string | null;
};

export type ThemeExposure = {
  slug: string;
  name: string;
  marketValue: number;
  weightPctNav: number;
  overCap: boolean;
};

export type MandateFlag = {
  code:
    | "position_cap"
    | "theme_cap"
    | "cash_floor"
    | "phase1_invested"
    | "all_clear";
  label: string;
  severity: "warn" | "ok";
};

export type PortfolioBook = {
  positions: OpenPositionRow[];
  invested: number;
  marketValue: number;
  unrealizedPnl: number;
  openCount: number;
  cash: number;
  nav: number;
  cashPctNav: number;
  themeExposures: ThemeExposure[];
  flags: MandateFlag[];
  cashUpdatedAt: string | null;
  cashNotes: string | null;
  markLabel: string;
  markAsOf: string | null;
};

type PositionDbRow = {
  id: string;
  instrument_id: string;
  side: "long" | "short";
  quantity: number;
  avg_cost: number;
  opened_at: string;
  thesis_summary: string | null;
  invalidation: string | null;
};

export async function getOpenPortfolioBook(): Promise<PortfolioBook> {
  const supabase = await createClient();

  const [
    { data: positionData, error: positionError },
    { data: stateData, error: stateError },
  ] = await Promise.all([
    supabase
      .from("positions")
      .select(
        "id, instrument_id, side, quantity, avg_cost, opened_at, thesis_summary, invalidation",
      )
      .eq("status", "open")
      .order("opened_at", { ascending: false }),
    supabase
      .from("portfolio_state")
      .select("cash, notes, updated_at")
      .limit(1)
      .maybeSingle(),
  ]);

  if (positionError) {
    throw new Error(`Failed to load positions: ${positionError.message}`);
  }
  if (stateError) {
    throw new Error(`Failed to load cash: ${stateError.message}`);
  }

  const state = stateData as {
    cash: number;
    notes: string | null;
    updated_at: string;
  } | null;
  const cash = Number(state?.cash ?? 0);
  const cashUpdatedAt = state?.updated_at ?? null;
  const cashNotes = state?.notes ?? null;

  const positions = (positionData as PositionDbRow[] | null) ?? [];
  if (positions.length === 0) {
    const nav = cash;
    const cashPctNav = nav > 0 ? (cash / nav) * 100 : 100;
    return {
      positions: [],
      invested: 0,
      marketValue: 0,
      unrealizedPnl: 0,
      openCount: 0,
      cash,
      nav,
      cashPctNav,
      themeExposures: [],
      flags: buildFlags({
        positions: [],
        cashPctNav,
        invested: 0,
        themeExposures: [],
      }),
      cashUpdatedAt,
      cashNotes,
      markLabel: "Close",
      markAsOf: null,
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
    ? await supabase
        .from("themes")
        .select("id, name, slug")
        .in("id", themeIds)
    : { data: [] as Array<{ id: string; name: string; slug: string }> };

  const instrumentMap = new Map(
    ((instruments as Array<{
      id: string;
      symbol: string;
      name: string;
    }> | null) ?? []).map((row) => [row.id, row]),
  );
  const themeById = new Map(
    ((themes as Array<{ id: string; name: string; slug: string }> | null) ??
      []).map((row) => [row.id, row]),
  );
  const primaryThemeByInstrument = new Map<
    string,
    { name: string; slug: string }
  >();
  for (const link of (links as Array<{
    instrument_id: string;
    theme_id: string;
    is_primary: boolean;
  }> | null) ?? []) {
    const theme = themeById.get(link.theme_id);
    if (!theme) continue;
    if (link.is_primary || !primaryThemeByInstrument.has(link.instrument_id)) {
      primaryThemeByInstrument.set(link.instrument_id, {
        name: theme.name,
        slug: theme.slug,
      });
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

  const draftRows = positions.map((position) => {
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
    const theme = primaryThemeByInstrument.get(position.instrument_id);

    return {
      id: position.id,
      instrumentId: position.instrument_id,
      symbol: instrument?.symbol ?? "—",
      name: instrument?.name ?? "Unknown",
      themeName: theme?.name ?? "—",
      themeSlug: theme?.slug ?? "other",
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
      invalidation: position.invalidation,
      priceSource: "close" as const,
    };
  });

  return assembleBook({
    cash,
    cashUpdatedAt,
    cashNotes,
    positions: draftRows,
    markLabel: "Close",
    markAsOf: null,
  });
}

function markCaption(state: LiveQuote["marketState"]): string {
  switch (state) {
    case "REGULAR":
      return "Delayed";
    case "PRE":
    case "PREPRE":
      return "Pre-market";
    case "POST":
    case "POSTPOST":
      return "After-hours";
    case "CLOSED":
      return "Last";
    case "UNKNOWN":
      return "Delayed";
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

function isUsTapeActive(state: LiveQuote["marketState"]): boolean {
  return state === "REGULAR" || state === "PRE" || state === "POST";
}

/** Overlay delayed Yahoo last sale onto stored closes. Does not write market_bars. */
export async function withLiveMarks(
  book: PortfolioBook,
): Promise<PortfolioBook> {
  if (book.positions.length === 0) return book;

  let quotes: LiveQuote[] = [];
  try {
    quotes = await fetchYahooQuotes(book.positions.map((row) => row.symbol));
  } catch (error) {
    console.error("Live quotes unavailable; using stored closes", error);
    return book;
  }

  const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
  const positions = book.positions.map((row) => {
    const quote = bySymbol.get(row.symbol);
    if (quote == null) return row;
    const lastClose = quote.price;
    const marketValue = row.quantity * lastClose;
    const unrealizedPnl = marketValue - row.costBasis;
    const unrealizedPnlPct =
      row.costBasis === 0 ? null : (unrealizedPnl / row.costBasis) * 100;
    return {
      ...row,
      lastClose,
      marketValue,
      unrealizedPnl,
      unrealizedPnlPct,
      priceSource: "live" as const,
    };
  });

  const live = positions
    .map((row) => bySymbol.get(row.symbol))
    .filter((quote): quote is LiveQuote => quote != null);
  const active = live.find((quote) => isUsTapeActive(quote.marketState)) ?? live[0];

  return assembleBook({
    cash: book.cash,
    cashUpdatedAt: book.cashUpdatedAt,
    cashNotes: book.cashNotes,
    positions,
    markLabel: active ? markCaption(active.marketState) : book.markLabel,
    markAsOf: active?.asOf ?? null,
  });
}

type DraftPosition = Omit<OpenPositionRow, "weightPctNav"> & {
  weightPctNav?: number | null;
};

function assembleBook(args: {
  cash: number;
  cashUpdatedAt: string | null;
  cashNotes: string | null;
  positions: DraftPosition[];
  markLabel: string;
  markAsOf: string | null;
}): PortfolioBook {
  const invested = args.positions.reduce((sum, row) => sum + row.costBasis, 0);
  const marketValue = args.positions.reduce(
    (sum, row) => sum + (row.marketValue ?? row.costBasis),
    0,
  );
  const nav = args.cash + marketValue;
  const cashPctNav = nav > 0 ? (args.cash / nav) * 100 : 100;

  const rows: OpenPositionRow[] = args.positions.map((row) => ({
    ...row,
    weightPctNav:
      nav > 0 ? ((row.marketValue ?? row.costBasis) / nav) * 100 : null,
  }));

  const byTheme = new Map<string, ThemeExposure>();
  for (const row of rows) {
    const value = row.marketValue ?? row.costBasis;
    const existing = byTheme.get(row.themeSlug);
    if (existing) {
      existing.marketValue += value;
    } else {
      byTheme.set(row.themeSlug, {
        slug: row.themeSlug,
        name: row.themeName,
        marketValue: value,
        weightPctNav: 0,
        overCap: false,
      });
    }
  }

  const themeExposures = [...byTheme.values()]
    .map((theme) => {
      const weightPctNav = nav > 0 ? (theme.marketValue / nav) * 100 : 0;
      return {
        ...theme,
        weightPctNav,
        overCap: weightPctNav > RISK_DEFAULTS.maxThemePctNav,
      };
    })
    .sort((a, b) => b.marketValue - a.marketValue);

  return {
    positions: rows,
    invested,
    marketValue,
    unrealizedPnl: marketValue - invested,
    openCount: rows.length,
    cash: args.cash,
    nav,
    cashPctNav,
    themeExposures,
    flags: buildFlags({
      positions: rows,
      cashPctNav,
      invested,
      themeExposures,
    }),
    cashUpdatedAt: args.cashUpdatedAt,
    cashNotes: args.cashNotes,
    markLabel: args.markLabel,
    markAsOf: args.markAsOf,
  };
}

function buildFlags(args: {
  positions: OpenPositionRow[];
  cashPctNav: number;
  invested: number;
  themeExposures: ThemeExposure[];
}): MandateFlag[] {
  const flags: MandateFlag[] = [];

  const oversized = args.positions.filter(
    (row) =>
      row.weightPctNav != null &&
      row.weightPctNav > RISK_DEFAULTS.maxPositionPctNav,
  );
  if (oversized.length > 0) {
    flags.push({
      code: "position_cap",
      severity: "warn",
      label: `${oversized.map((row) => row.symbol).join(", ")} above ${RISK_DEFAULTS.maxPositionPctNav}% NAV`,
    });
  }

  const hotThemes = args.themeExposures.filter((theme) => theme.overCap);
  if (hotThemes.length > 0) {
    flags.push({
      code: "theme_cap",
      severity: "warn",
      label: `${hotThemes.map((theme) => theme.name).join(", ")} above ${RISK_DEFAULTS.maxThemePctNav}% NAV`,
    });
  }

  if (args.cashPctNav < RISK_DEFAULTS.minCashPctNav) {
    flags.push({
      code: "cash_floor",
      severity: "warn",
      label: `Cash ${args.cashPctNav.toFixed(1)}% is below ${RISK_DEFAULTS.minCashPctNav}% floor`,
    });
  }

  if (args.invested > RISK_DEFAULTS.phase1InvestedCapUsd) {
    flags.push({
      code: "phase1_invested",
      severity: "warn",
      label: `Invested cost above phase-1 cap ($${RISK_DEFAULTS.phase1InvestedCapUsd.toLocaleString()})`,
    });
  }

  if (flags.length === 0) {
    flags.push({
      code: "all_clear",
      severity: "ok",
      label: "Mandate checks clear vs NAV",
    });
  }

  return flags;
}
