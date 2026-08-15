import { createClient } from "@/lib/supabase/server";
import {
  computeReturnPct,
  RETURN_WINDOWS,
  type PricePoint,
  type ReturnWindow,
} from "@/lib/market/returns";

export type WorkbenchNameNode = {
  symbol: string;
  name: string;
  themeSlug: string;
  themeName: string;
  marketCap: number;
  returns: Partial<Record<ReturnWindow, number | null>>;
};

export type WorkbenchUniverse = {
  themes: Array<{ slug: string; name: string }>;
  names: WorkbenchNameNode[];
};

const RETURN_KEYS: ReturnWindow[] = RETURN_WINDOWS.map((window) => window.key);

export async function getWorkbenchUniverse(): Promise<WorkbenchUniverse> {
  const supabase = await createClient();

  const [
    { data: instrumentData, error: instrumentError },
    { data: themeData, error: themeError },
    { data: linkData, error: linkError },
    { data: capData, error: capError },
  ] = await Promise.all([
    supabase
      .from("instruments")
      .select("id, symbol, name, status")
      .neq("status", "archived")
      .eq("is_benchmark", false)
      .order("symbol", { ascending: true }),
    supabase
      .from("themes")
      .select("id, slug, name, sort_order")
      .order("sort_order", { ascending: true }),
    supabase
      .from("instrument_themes")
      .select("instrument_id, theme_id, is_primary"),
    supabase
      .from("market_caps")
      .select("instrument_id, as_of_date, market_cap"),
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
  if (capError) {
    throw new Error(`Failed to load market caps: ${capError.message}`);
  }

  const instruments = (instrumentData as Array<{
    id: string;
    symbol: string;
    name: string;
  }> | null) ?? [];

  // The longest return window is 2y. With 5 years of history in market_bars, an
  // unbounded all-instrument query would exceed the 1,000-row PostgREST cap, so
  // fetch a 25-month window per instrument (~530 rows each) in parallel.
  const barStart = new Date();
  barStart.setUTCMonth(barStart.getUTCMonth() - 25);
  const barStartIso = barStart.toISOString().slice(0, 10);

  const barResults = await Promise.all(
    instruments.map(async (instrument) => {
      const { data, error } = await supabase
        .from("market_bars")
        .select("bar_date, close, adj_close")
        .eq("instrument_id", instrument.id)
        .gte("bar_date", barStartIso)
        .order("bar_date", { ascending: true });
      if (error) {
        throw new Error(`Failed to load bars: ${error.message}`);
      }
      return { instrumentId: instrument.id, rows: data ?? [] };
    }),
  );
  const themes = (themeData as Array<{
    id: string;
    slug: string;
    name: string;
  }> | null) ?? [];
  const links = (linkData as Array<{
    instrument_id: string;
    theme_id: string;
    is_primary: boolean;
  }> | null) ?? [];

  const themeById = new Map(themes.map((theme) => [theme.id, theme]));
  const primaryTheme = new Map<string, { slug: string; name: string }>();
  for (const link of links) {
    const theme = themeById.get(link.theme_id);
    if (!theme) continue;
    if (link.is_primary || !primaryTheme.has(link.instrument_id)) {
      primaryTheme.set(link.instrument_id, {
        slug: theme.slug,
        name: theme.name,
      });
    }
  }

  const latestCap = new Map<string, { asOf: string; marketCap: number }>();
  for (const row of (capData as Array<{
    instrument_id: string;
    as_of_date: string;
    market_cap: number;
  }> | null) ?? []) {
    const existing = latestCap.get(row.instrument_id);
    if (!existing || row.as_of_date > existing.asOf) {
      latestCap.set(row.instrument_id, {
        asOf: row.as_of_date,
        marketCap: Number(row.market_cap),
      });
    }
  }

  const barsByInstrument = new Map<string, PricePoint[]>();
  for (const { instrumentId, rows } of barResults) {
    const points: PricePoint[] = [];
    for (const row of rows as Array<{
      bar_date: string;
      close: number | null;
      adj_close: number | null;
    }>) {
      const close = row.adj_close ?? row.close;
      if (close == null) continue;
      points.push({ date: row.bar_date, close: Number(close) });
    }
    barsByInstrument.set(instrumentId, points);
  }

  const names: WorkbenchNameNode[] = instruments
    .map((instrument) => {
      const cap = latestCap.get(instrument.id)?.marketCap ?? null;
      if (cap == null || cap <= 0) return null;
      const theme = primaryTheme.get(instrument.id) ?? {
        slug: "other",
        name: "Other",
      };
      const points = barsByInstrument.get(instrument.id) ?? [];
      const returns: WorkbenchNameNode["returns"] = {};
      for (const key of RETURN_KEYS) {
        returns[key] = computeReturnPct(points, key);
      }
      return {
        symbol: instrument.symbol,
        name: instrument.name,
        themeSlug: theme.slug,
        themeName: theme.name,
        marketCap: cap,
        returns,
      };
    })
    .filter((row): row is WorkbenchNameNode => row != null);

  return {
    themes: themes.map((theme) => ({ slug: theme.slug, name: theme.name })),
    names,
  };
}
