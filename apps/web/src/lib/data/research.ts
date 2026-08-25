import type { DossierResearchLevel, DossierStatus } from "@powerfund/domain";

import { resolveDb, type DbClient } from "@/lib/supabase/db";

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
  status: DossierStatus;
  research_level: DossierResearchLevel;
  summary: string;
  thesis: string | null;
  catalysts: string | null;
  risks: string | null;
  invalidation: string | null;
  competitive_notes: string | null;
  next_diligence: string | null;
  source: string | null;
  as_of_at: string | null;
  verified_at: string | null;
  next_review_at: string | null;
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

export async function listThemes(client?: DbClient): Promise<ThemeRow[]> {
  const supabase = await resolveDb(client);
  const { data, error } = await supabase
    .from("themes")
    .select("id, slug, name, description, is_core, sort_order")
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`Failed to load themes: ${error.message}`);
  }

  return (data as ThemeRow[] | null) ?? [];
}

export async function listInstrumentsWithThemes(
  client?: DbClient,
): Promise<InstrumentWithTheme[]> {
  const supabase = await resolveDb(client);

  const [instrumentsResult, linksResult, themesResult, dossiersResult] =
    await Promise.all([
      supabase
        .from("instruments")
        .select("id, symbol, name, asset_class, status, notes")
        .neq("status", "archived")
        .eq("is_benchmark", false)
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

export type PriceBar = {
  date: string;
  close: number;
};

const BAR_PAGE_SIZE = 1000;

export async function getInstrumentPriceHistory(
  instrumentId: string,
): Promise<PriceBar[]> {
  const supabase = await resolveDb();

  // PostgREST caps responses at 1,000 rows; five years of daily bars is ~1,260,
  // so page through the history instead of issuing one unbounded query.
  const rows: Array<{
    bar_date: string;
    close: number | null;
    adj_close: number | null;
  }> = [];
  for (let page = 0; ; page += 1) {
    const { data, error } = await supabase
      .from("market_bars")
      .select("bar_date, close, adj_close")
      .eq("instrument_id", instrumentId)
      .order("bar_date", { ascending: true })
      .range(page * BAR_PAGE_SIZE, (page + 1) * BAR_PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to load price history: ${error.message}`);
    }

    const batch = (data as typeof rows | null) ?? [];
    rows.push(...batch);
    if (batch.length < BAR_PAGE_SIZE) break;
  }

  return rows
    .map((row) => {
      const close = row.adj_close ?? row.close;
      if (close == null) return null;
      return { date: row.bar_date, close };
    })
    .filter((row): row is PriceBar => row != null);
}

export async function getInstrumentDossier(
  symbol: string,
  client?: DbClient,
): Promise<InstrumentDossier | null> {
  const normalized = symbol.trim().toUpperCase();
  const instruments = await listInstrumentsWithThemes(client);
  const instrument = instruments.find((row) => row.symbol === normalized);
  if (!instrument) {
    return null;
  }

  const supabase = await resolveDb(client);
  const { data, error } = await supabase
    .from("dossiers")
    .select(
      "id, status, research_level, summary, thesis, catalysts, risks, invalidation, competitive_notes, next_diligence, source, as_of_at, verified_at, next_review_at, updated_at",
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

export type DossierReviewRow = {
  instrumentId: string;
  status: DossierRow["status"];
  nextDiligence: string | null;
  updatedAt: string;
};

export async function listDossierReviews(): Promise<DossierReviewRow[]> {
  const supabase = await resolveDb();
  const { data, error } = await supabase
    .from("dossiers")
    .select("instrument_id, status, next_diligence, updated_at");

  if (error) {
    throw new Error(`Failed to load dossiers: ${error.message}`);
  }

  return (
    (data as Array<{
      instrument_id: string;
      status: DossierRow["status"];
      next_diligence: string | null;
      updated_at: string;
    }> | null) ?? []
  ).map((row) => ({
    instrumentId: row.instrument_id,
    status: row.status,
    nextDiligence: row.next_diligence,
    updatedAt: row.updated_at,
  }));
}

export async function getInstrumentMarketSnapshot(
  instrumentId: string,
): Promise<InstrumentMarketSnapshot> {
  const supabase = await resolveDb();

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
