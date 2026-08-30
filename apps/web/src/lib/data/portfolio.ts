import {
  addCalendarDays,
  aiCapexNavPct,
  aiMemoryNavPct,
  RISK_DEFAULTS,
  unclassifiedSymbols,
} from "@powerfund/domain";
import { fetchYahooQuotes, type LiveQuote } from "@powerfund/data-clients";

import { isTapeActive, quoteCaption } from "@/lib/market/quotes";
import { resolveDb, type DbClient } from "@/lib/supabase/db";

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
  lastCloseSession: string | null;
  /** Last sale used for NAV (live when the tape is open, else last close). */
  markPrice: number | null;
  previousClose: number | null;
  /** Close on or before 7 calendar days before the last stored session. */
  weekClose: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPct: number | null;
  dayPnl: number | null;
  dayPnlPct: number | null;
  weekPnl: number | null;
  weekPnlPct: number | null;
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
    | "drawdown_kill_switch"
    | "snapshot_stale"
    | "ai_capex_factor"
    | "ai_memory_sleeve"
    | "factor_unclassified"
    | "all_clear";
  label: string;
  severity: "warn" | "ok";
  /**
   * When false, Mandate still shows the live condition but Briefing Due
   * does not treat it as unfinished work.
   */
  due?: boolean;
};

export type PortfolioBook = {
  positions: OpenPositionRow[];
  invested: number;
  marketValue: number;
  unrealizedPnl: number;
  dayPnl: number | null;
  dayPnlPct: number | null;
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
  tapeActive: boolean;
  priceDataThrough: string | null;
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

export async function getOpenPortfolioBook(
  client?: DbClient,
): Promise<PortfolioBook> {
  const supabase = await resolveDb(client);

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
      dayPnl: null,
      dayPnlPct: null,
      openCount: 0,
      cash,
      nav,
      cashPctNav,
      themeExposures: [],
      flags: buildFlags({
        positions: [],
        cashPctNav,
        invested: 0,
        nav,
        themeExposures: [],
      }),
      cashUpdatedAt,
      cashNotes,
      markLabel: "Close",
      markAsOf: null,
      tapeActive: false,
      priceDataThrough: null,
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
        .select("bar_date, close, adj_close")
        .eq("instrument_id", instrumentId)
        .order("bar_date", { ascending: false })
        .limit(12);
      const bars = ((data as Array<{
        bar_date: string;
        close: number | null;
        adj_close: number | null;
      }> | null) ?? [])
        .map((row) => {
          const close = row.adj_close ?? row.close;
          if (close == null) return null;
          return { date: row.bar_date, close: Number(close) };
        })
        .filter((row): row is { date: string; close: number } => row != null);
      const latest = bars[0];
      const prior = bars[1];
      if (latest == null) {
        return [instrumentId, null] as const;
      }
      return [
        instrumentId,
        {
          close: latest.close,
          date: latest.date,
          previousClose: prior?.close ?? null,
          weekClose: weekCloseFromBars(bars),
        },
      ] as const;
    }),
  );
  const closeMap = new Map(closes);

  const draftRows = positions.map((position) => {
    const instrument = instrumentMap.get(position.instrument_id);
    const quantity = Number(position.quantity);
    const avgCost = Number(position.avg_cost);
    const costBasis = quantity * avgCost;
    const mark = closeMap.get(position.instrument_id) ?? null;
    const lastClose = mark?.close ?? null;
    const lastCloseSession = mark?.date ?? null;
    const previousClose = mark?.previousClose ?? null;
    const weekClose = mark?.weekClose ?? null;
    const marked = markPosition(
      quantity,
      costBasis,
      lastClose,
      previousClose,
      weekClose,
    );
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
      lastCloseSession,
      previousClose,
      weekClose,
      openedAt: position.opened_at,
      thesisSummary: position.thesis_summary,
      invalidation: position.invalidation,
      priceSource: "close" as const,
      ...marked,
    };
  });

  return assembleBook({
    cash,
    cashUpdatedAt,
    cashNotes,
    positions: draftRows,
    markLabel: "Close",
    markAsOf: null,
    tapeActive: false,
  });
}

function markPosition(
  quantity: number,
  costBasis: number,
  markPrice: number | null,
  previousClose: number | null,
  weekClose: number | null,
): Pick<
  OpenPositionRow,
  | "markPrice"
  | "marketValue"
  | "unrealizedPnl"
  | "unrealizedPnlPct"
  | "dayPnl"
  | "dayPnlPct"
  | "weekPnl"
  | "weekPnlPct"
> {
  const marketValue = markPrice == null ? null : quantity * markPrice;
  const unrealizedPnl = marketValue == null ? null : marketValue - costBasis;
  const unrealizedPnlPct =
    unrealizedPnl == null || costBasis === 0
      ? null
      : (unrealizedPnl / costBasis) * 100;
  const dayPnl =
    markPrice == null || previousClose == null
      ? null
      : quantity * (markPrice - previousClose);
  const dayPnlPct =
    markPrice == null || previousClose == null || previousClose === 0
      ? null
      : ((markPrice - previousClose) / previousClose) * 100;
  const weekPnl =
    markPrice == null || weekClose == null
      ? null
      : quantity * (markPrice - weekClose);
  const weekPnlPct =
    markPrice == null || weekClose == null || weekClose === 0
      ? null
      : ((markPrice - weekClose) / weekClose) * 100;
  return {
    markPrice,
    marketValue,
    unrealizedPnl,
    unrealizedPnlPct,
    dayPnl,
    dayPnlPct,
    weekPnl,
    weekPnlPct,
  };
}

/**
 * Close on or before 7 calendar days before the latest bar. Bars are newest
 * first. Matches the 1W lookback on dossiers (~5 sessions, not week-to-date).
 */
export function weekCloseFromBars(
  bars: Array<{ date: string; close: number }>,
): number | null {
  const latest = bars[0];
  if (latest == null) return null;
  const target = addCalendarDays(latest.date, -7);
  for (const bar of bars) {
    if (bar.date <= target) return bar.close;
  }
  return null;
}

/** Overlay delayed Yahoo last sale onto stored closes. Does not write market_bars. */
export function applyLiveMarks(
  book: PortfolioBook,
  quotes: LiveQuote[],
): PortfolioBook {
  if (book.positions.length === 0 || quotes.length === 0) return book;

  const bySymbol = new Map(
    quotes.map((quote) => [quote.symbol.toUpperCase(), quote]),
  );
  const positions = book.positions.map((row) => {
    const quote = bySymbol.get(row.symbol.toUpperCase());
    if (quote == null) return row;
    const previousClose = quote.previousClose ?? row.previousClose;
    return {
      ...row,
      previousClose,
      priceSource: "live" as const,
      ...markPosition(
        row.quantity,
        row.costBasis,
        quote.price,
        previousClose,
        row.weekClose,
      ),
    };
  });

  const live = positions
    .map((row) => bySymbol.get(row.symbol.toUpperCase()))
    .filter((quote): quote is LiveQuote => quote != null);
  const active =
    live.find((quote) => isTapeActive(quote.marketState)) ?? live[0];

  return assembleBook({
    cash: book.cash,
    cashUpdatedAt: book.cashUpdatedAt,
    cashNotes: book.cashNotes,
    positions,
    markLabel: active ? quoteCaption(active) : book.markLabel,
    markAsOf: active?.asOf ?? null,
    tapeActive: live.some((quote) => isTapeActive(quote.marketState)),
  });
}

export async function withLiveMarks(
  book: PortfolioBook,
): Promise<PortfolioBook> {
  if (book.positions.length === 0) return book;

  try {
    const quotes = await fetchYahooQuotes(
      book.positions.map((row) => row.symbol),
    );
    return applyLiveMarks(book, quotes);
  } catch (error) {
    console.error("Live quotes unavailable; using stored closes", error);
    return book;
  }
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
  tapeActive: boolean;
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

  const sessions = rows
    .map((row) => row.lastCloseSession)
    .filter((date): date is string => date != null)
    .sort();
  const priceDataThrough = sessions.at(-1) ?? null;
  const dayMove = bookDayMove(rows, args.cash, nav);

  return {
    positions: rows,
    invested,
    marketValue,
    unrealizedPnl: marketValue - invested,
    dayPnl: dayMove.dayPnl,
    dayPnlPct: dayMove.dayPnlPct,
    openCount: rows.length,
    cash: args.cash,
    nav,
    cashPctNav,
    themeExposures,
    flags: buildFlags({
      positions: rows,
      cashPctNav,
      invested,
      nav,
      themeExposures,
    }),
    cashUpdatedAt: args.cashUpdatedAt,
    cashNotes: args.cashNotes,
    markLabel: args.markLabel,
    markAsOf: args.markAsOf,
    tapeActive: args.tapeActive,
    priceDataThrough,
  };
}

function bookDayMove(
  positions: OpenPositionRow[],
  cash: number,
  nav: number,
): { dayPnl: number | null; dayPnlPct: number | null } {
  let priorMarket = 0;
  let anyPrior = false;
  for (const row of positions) {
    if (row.previousClose != null) {
      priorMarket += row.quantity * row.previousClose;
      anyPrior = true;
    } else {
      priorMarket += row.marketValue ?? row.costBasis;
    }
  }
  if (!anyPrior) return { dayPnl: null, dayPnlPct: null };
  const priorNav = cash + priorMarket;
  const dayPnl = nav - priorNav;
  const dayPnlPct = priorNav > 0 ? (dayPnl / priorNav) * 100 : null;
  return { dayPnl, dayPnlPct };
}

function buildFlags(args: {
  positions: OpenPositionRow[];
  cashPctNav: number;
  invested: number;
  nav: number;
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

  const mandatePositions = args.positions.map((row) => ({
    symbol: row.symbol,
    themeSlug: row.themeSlug,
    marketValue: row.marketValue ?? row.costBasis,
    costBasis: row.costBasis,
  }));
  const factorPct = aiCapexNavPct(mandatePositions, args.nav);
  if (
    factorPct != null &&
    factorPct > RISK_DEFAULTS.maxAiCapexFactorPctNav
  ) {
    flags.push({
      code: "ai_capex_factor",
      severity: "warn",
      label: `AI-capex complex is ${factorPct.toFixed(1)}% of NAV (cap ${RISK_DEFAULTS.maxAiCapexFactorPctNav}%)`,
    });
  }

  const memoryPct = aiMemoryNavPct(mandatePositions, args.nav);
  if (
    memoryPct != null &&
    memoryPct > RISK_DEFAULTS.maxAiMemorySleevePctNav
  ) {
    flags.push({
      code: "ai_memory_sleeve",
      severity: "warn",
      label: `AI memory/storage sleeve is ${memoryPct.toFixed(1)}% of NAV (guide ${RISK_DEFAULTS.maxAiMemorySleevePctNav}%)`,
    });
  }

  const unknown = unclassifiedSymbols(args.positions.map((row) => row.symbol));
  if (unknown.length > 0) {
    flags.push({
      code: "factor_unclassified",
      severity: "warn",
      label: `${unknown.join(", ")} ${unknown.length === 1 ? "has" : "have"} no factor map — classify before treating ${unknown.length === 1 ? "it" : "them"} as AI-capex or a diversifier`,
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
