import { createClient } from "@/lib/supabase/server";

export type ThemeRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_core: boolean;
  sort_order: number;
};

export type InstrumentWithTheme = {
  id: string;
  symbol: string;
  name: string;
  asset_class: string;
  status: string;
  notes: string | null;
  theme_slug: string;
  theme_name: string;
  has_dossier: boolean;
};

export type DossierRow = {
  id: string;
  status: "watch" | "investigate" | "active_thesis" | "passed";
  summary: string;
  thesis: string | null;
  catalysts: string | null;
  risks: string | null;
  invalidation: string | null;
  competitive_notes: string | null;
  next_diligence: string | null;
  source: string | null;
  updated_at: string;
};

export type InstrumentDossier = {
  instrument: InstrumentWithTheme;
  dossier: DossierRow | null;
};

type InstrumentRow = {
  id: string;
  symbol: string;
  name: string;
  asset_class: string;
  status: string;
  notes: string | null;
};

type InstrumentThemeLink = {
  instrument_id: string;
  theme_id: string;
  is_primary: boolean;
};

type ThemeRef = {
  id: string;
  slug: string;
  name: string;
};

export async function listThemes(): Promise<ThemeRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("themes")
    .select("id, slug, name, description, is_core, sort_order")
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`Failed to load themes: ${error.message}`);
  }

  return (data as ThemeRow[] | null) ?? [];
}

export async function listInstrumentsWithThemes(): Promise<
  InstrumentWithTheme[]
> {
  const supabase = await createClient();

  const [instrumentsResult, linksResult, themesResult, dossiersResult] =
    await Promise.all([
      supabase
        .from("instruments")
        .select("id, symbol, name, asset_class, status, notes")
        .neq("status", "archived")
        .order("symbol", { ascending: true }),
      supabase
        .from("instrument_themes")
        .select("instrument_id, theme_id, is_primary")
        .eq("is_primary", true),
      supabase.from("themes").select("id, slug, name"),
      supabase.from("dossiers").select("instrument_id"),
    ]);

  if (instrumentsResult.error) {
    throw new Error(
      `Failed to load instruments: ${instrumentsResult.error.message}`,
    );
  }
  if (linksResult.error) {
    throw new Error(
      `Failed to load instrument themes: ${linksResult.error.message}`,
    );
  }
  if (themesResult.error) {
    throw new Error(`Failed to load themes: ${themesResult.error.message}`);
  }
  if (dossiersResult.error) {
    throw new Error(`Failed to load dossiers: ${dossiersResult.error.message}`);
  }

  const instruments = (instrumentsResult.data as InstrumentRow[] | null) ?? [];
  const links = (linksResult.data as InstrumentThemeLink[] | null) ?? [];
  const themes = (themesResult.data as ThemeRef[] | null) ?? [];
  const dossierInstrumentIds = new Set(
    ((dossiersResult.data as { instrument_id: string }[] | null) ?? []).map(
      (row) => row.instrument_id,
    ),
  );

  const themesById = new Map(themes.map((theme) => [theme.id, theme]));
  const primaryThemeByInstrument = new Map(
    links.map((link) => [link.instrument_id, link.theme_id]),
  );

  return instruments
    .map((instrument) => {
      const themeId = primaryThemeByInstrument.get(instrument.id);
      const theme = themeId ? themesById.get(themeId) : undefined;
      if (!theme) {
        return null;
      }

      return {
        id: instrument.id,
        symbol: instrument.symbol,
        name: instrument.name,
        asset_class: instrument.asset_class,
        status: instrument.status,
        notes: instrument.notes,
        theme_slug: theme.slug,
        theme_name: theme.name,
        has_dossier: dossierInstrumentIds.has(instrument.id),
      } satisfies InstrumentWithTheme;
    })
    .filter((row): row is InstrumentWithTheme => row !== null)
    .sort((a, b) => {
      const themeCmp = a.theme_name.localeCompare(b.theme_name);
      if (themeCmp !== 0) return themeCmp;
      return a.symbol.localeCompare(b.symbol);
    });
}

export type InstrumentMarketSnapshot = {
  lastBarDate: string | null;
  lastClose: number | null;
  marketCap: number | null;
  marketCapAsOf: string | null;
  latestRevenue: number | null;
  latestFcf: number | null;
  latestCapex: number | null;
  latestNetDebt: number | null;
  fundamentalsPeriodEnd: string | null;
};

export async function getInstrumentDossier(
  symbol: string,
): Promise<InstrumentDossier | null> {
  const normalized = symbol.trim().toUpperCase();
  const instruments = await listInstrumentsWithThemes();
  const instrument = instruments.find((row) => row.symbol === normalized);
  if (!instrument) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dossiers")
    .select(
      "id, status, summary, thesis, catalysts, risks, invalidation, competitive_notes, next_diligence, source, updated_at",
    )
    .eq("instrument_id", instrument.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load dossier: ${error.message}`);
  }

  return {
    instrument,
    dossier: (data as DossierRow | null) ?? null,
  };
}

export async function getInstrumentMarketSnapshot(
  instrumentId: string,
): Promise<InstrumentMarketSnapshot> {
  const supabase = await createClient();

  const [barResult, capResult, fundResult] = await Promise.all([
    supabase
      .from("market_bars")
      .select("bar_date, close, adj_close")
      .eq("instrument_id", instrumentId)
      .order("bar_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("market_caps")
      .select("as_of_date, market_cap")
      .eq("instrument_id", instrumentId)
      .order("as_of_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("fundamentals_quarterly")
      .select("period_end, revenue, free_cash_flow, capex, net_debt")
      .eq("instrument_id", instrumentId)
      .order("period_end", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const bar = barResult.data as {
    bar_date: string;
    close: number | null;
    adj_close: number | null;
  } | null;
  const cap = capResult.data as {
    as_of_date: string;
    market_cap: number;
  } | null;
  const fund = fundResult.data as {
    period_end: string;
    revenue: number | null;
    free_cash_flow: number | null;
    capex: number | null;
    net_debt: number | null;
  } | null;

  return {
    lastBarDate: bar?.bar_date ?? null,
    lastClose: bar?.adj_close ?? bar?.close ?? null,
    marketCap: cap?.market_cap ?? null,
    marketCapAsOf: cap?.as_of_date ?? null,
    latestRevenue: fund?.revenue ?? null,
    latestFcf: fund?.free_cash_flow ?? null,
    latestCapex: fund?.capex ?? null,
    latestNetDebt: fund?.net_debt ?? null,
    fundamentalsPeriodEnd: fund?.period_end ?? null,
  };
}
