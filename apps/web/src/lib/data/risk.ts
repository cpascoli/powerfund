import {
  aiCapexNavPct,
  aiCapexWeight,
  aiMemoryNavPct,
  computeCrowding,
  pairwiseCorrelations,
  RISK_DEFAULTS,
  type CrowdingSnapshot,
  type CorrelationPair,
} from "@powerfund/domain";

import { getOpenPortfolioBook } from "@/lib/data/portfolio";
import { createClient } from "@/lib/supabase/server";

const BAR_PAGE_SIZE = 1000;
const CORRELATION_WINDOW_DAYS = 400;

export type RiskCrowdingRow = {
  symbol: string;
  name: string;
  themeName: string;
  held: boolean;
  aiCapexWeight: number | null;
  crowding: CrowdingSnapshot;
};

export type RiskView = {
  deployed: number;
  aiCapexPct: number | null;
  aiMemoryPct: number | null;
  diversifierPct: number | null;
  stressNav: number;
  stressNavDelta: number;
  stressNavDeltaPct: number | null;
  holdings: Array<{
    symbol: string;
    name: string;
    themeName: string;
    marketValue: number;
    aiCapexWeight: number | null;
  }>;
  crowding: RiskCrowdingRow[];
  symbols: string[];
  pairs: CorrelationPair[];
};

type BarRow = {
  bar_date: string;
  close: number | null;
  adj_close: number | null;
};

async function loadCloses(
  instrumentId: string,
): Promise<Array<{ date: string; close: number }>> {
  const supabase = await createClient();
  const points: Array<{ date: string; close: number }> = [];
  for (let page = 0; ; page += 1) {
    const { data, error } = await supabase
      .from("market_bars")
      .select("bar_date, close, adj_close")
      .eq("instrument_id", instrumentId)
      .order("bar_date", { ascending: true })
      .range(page * BAR_PAGE_SIZE, (page + 1) * BAR_PAGE_SIZE - 1);
    if (error) {
      throw new Error(`Failed to load bars: ${error.message}`);
    }
    const batch = (data as BarRow[] | null) ?? [];
    for (const row of batch) {
      const close = row.adj_close ?? row.close;
      if (close == null) continue;
      points.push({ date: row.bar_date, close: Number(close) });
    }
    if (batch.length < BAR_PAGE_SIZE) break;
  }
  return points;
}

export async function getRiskView(): Promise<RiskView> {
  const supabase = await createClient();
  const book = await getOpenPortfolioBook();

  const [
    { data: instrumentData, error: instrumentError },
    { data: themeData, error: themeError },
    { data: linkData, error: linkError },
    { data: dossierData, error: dossierError },
  ] = await Promise.all([
    supabase
      .from("instruments")
      .select("id, symbol, name, status")
      .neq("status", "archived")
      .eq("is_benchmark", false)
      .order("symbol", { ascending: true }),
    supabase.from("themes").select("id, slug, name"),
    supabase
      .from("instrument_themes")
      .select("instrument_id, theme_id, is_primary"),
    supabase.from("dossiers").select("instrument_id, status"),
  ]);

  if (instrumentError) {
    throw new Error(`Failed to load instruments: ${instrumentError.message}`);
  }
  if (themeError) {
    throw new Error(`Failed to load themes: ${themeError.message}`);
  }
  if (linkError) {
    throw new Error(`Failed to load theme links: ${linkError.message}`);
  }
  if (dossierError) {
    throw new Error(`Failed to load dossiers: ${dossierError.message}`);
  }

  const instruments = (instrumentData as Array<{
    id: string;
    symbol: string;
    name: string;
  }> | null) ?? [];
  const themes = (themeData as Array<{
    id: string;
    slug: string;
    name: string;
  }> | null) ?? [];
  const themeById = new Map(themes.map((theme) => [theme.id, theme]));
  const primaryTheme = new Map<string, { slug: string; name: string }>();
  for (const link of (linkData as Array<{
    instrument_id: string;
    theme_id: string;
    is_primary: boolean;
  }> | null) ?? []) {
    const theme = themeById.get(link.theme_id);
    if (!theme) continue;
    if (link.is_primary || !primaryTheme.has(link.instrument_id)) {
      primaryTheme.set(link.instrument_id, {
        slug: theme.slug,
        name: theme.name,
      });
    }
  }

  const dossierStatus = new Map<string, string>();
  for (const row of (dossierData as Array<{
    instrument_id: string;
    status: string;
  }> | null) ?? []) {
    dossierStatus.set(row.instrument_id, row.status);
  }

  const heldIds = new Set(book.positions.map((row) => row.instrumentId));
  const series = await Promise.all(
    instruments.map(async (instrument) => ({
      instrument,
      points: await loadCloses(instrument.id),
    })),
  );

  const crowding: RiskCrowdingRow[] = [];
  const correlationSeries: Array<{
    symbol: string;
    points: Array<{ date: string; close: number }>;
  }> = [];
  const corrCutoff = new Date();
  corrCutoff.setUTCDate(corrCutoff.getUTCDate() - CORRELATION_WINDOW_DAYS);
  const corrCutoffIso = corrCutoff.toISOString().slice(0, 10);

  for (const { instrument, points } of series) {
    const closes = points.map((point) => point.close);
    const snapshot = computeCrowding(closes);
    if (snapshot) {
      crowding.push({
        symbol: instrument.symbol,
        name: instrument.name,
        themeName: primaryTheme.get(instrument.id)?.name ?? "Other",
        held: heldIds.has(instrument.id),
        aiCapexWeight: aiCapexWeight(instrument.symbol),
        crowding: snapshot,
      });
    }

    const status = dossierStatus.get(instrument.id);
    const inCorr =
      heldIds.has(instrument.id) ||
      status === "investigate" ||
      status === "active_thesis";
    if (inCorr && points.length > 20) {
      correlationSeries.push({
        symbol: instrument.symbol,
        points: points.filter((point) => point.date >= corrCutoffIso),
      });
    }
  }

  crowding.sort((a, b) => {
    if (a.held !== b.held) return a.held ? -1 : 1;
    const bandRank = { crowded: 0, extended: 1, calm: 2 };
    if (bandRank[a.crowding.band] !== bandRank[b.crowding.band]) {
      return bandRank[a.crowding.band] - bandRank[b.crowding.band];
    }
    return a.symbol.localeCompare(b.symbol);
  });

  const holdings = book.positions.map((row) => ({
    symbol: row.symbol,
    name: row.name,
    themeName: row.themeName,
    marketValue: row.marketValue ?? row.costBasis,
    aiCapexWeight: aiCapexWeight(row.symbol),
  }));
  const deployed = holdings.reduce((sum, row) => sum + row.marketValue, 0);
  const mandatePositions = book.positions.map((row) => ({
    symbol: row.symbol,
    themeSlug: row.themeSlug,
    marketValue: row.marketValue ?? row.costBasis,
    costBasis: row.costBasis,
  }));
  const aiCapexPct = aiCapexNavPct(mandatePositions, book.nav);
  const aiMemoryPct = aiMemoryNavPct(mandatePositions, book.nav);
  const complexValue = holdings.reduce((sum, row) => {
    if (row.aiCapexWeight == null) return sum;
    return sum + row.marketValue * row.aiCapexWeight;
  }, 0);
  const diversifierValue = holdings.reduce((sum, row) => {
    if (row.aiCapexWeight == null || row.aiCapexWeight > 0) return sum;
    return sum + row.marketValue;
  }, 0);
  const stressNavDelta = 0.2 * complexValue;
  const stressNav = book.nav - stressNavDelta;

  return {
    deployed,
    aiCapexPct,
    aiMemoryPct,
    diversifierPct:
      book.nav > 0 ? (diversifierValue / book.nav) * 100 : null,
    stressNav,
    stressNavDelta,
    stressNavDeltaPct: book.nav > 0 ? (stressNavDelta / book.nav) * 100 : null,
    holdings,
    crowding,
    symbols: correlationSeries.map((row) => row.symbol),
    pairs: pairwiseCorrelations(correlationSeries),
  };
}

export function correlationLookup(
  pairs: CorrelationPair[],
): Map<string, number | null> {
  const map = new Map<string, number | null>();
  for (const pair of pairs) {
    map.set(`${pair.a}|${pair.b}`, pair.correlation);
    map.set(`${pair.b}|${pair.a}`, pair.correlation);
  }
  return map;
}

export { RISK_DEFAULTS };
