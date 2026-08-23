import { DOSSIER_STATUSES, INFLECTION_SCORER_KEY, type DossierStatus, type InflectionSetup } from "@powerfund/domain";

import {
  type ExploreName,
  type ExploreTheme,
} from "@/lib/data/explore-catalog";
import { computeReturnPct, type PricePoint } from "@/lib/market/returns";
import { resolveDb, type DbClient } from "@/lib/supabase/db";

export type ExploreCatalog = {
  themes: ExploreTheme[];
  names: ExploreName[];
};

const BAR_PAGE_SIZE = 1000;

type InstrumentRow = {
  id: string;
  symbol: string;
  name: string;
};

type ThemeRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_core: boolean;
};

type ThemeLink = {
  instrument_id: string;
  theme_id: string;
  is_primary: boolean;
};

type DossierRow = {
  instrument_id: string;
  status: string;
  next_review_at: string | null;
};

type SetupRow = {
  instrument_id: string;
  setup: string;
  stale: boolean;
};

type BarRow = {
  instrument_id: string;
  bar_date: string;
  close: number | null;
  adj_close: number | null;
};

const INFLECTION_SETUPS: InflectionSetup[] = [
  "improving_research",
  "improving_extended",
  "correction_candidate",
  "thesis_check",
  "watch",
  "falling_fundamentals",
  "avoid_late",
  "insufficient_data",
];

function asInflectionSetup(value: string): InflectionSetup | null {
  return (INFLECTION_SETUPS as readonly string[]).includes(value)
    ? (value as InflectionSetup)
    : null;
}

function asDossierStatus(value: string): DossierStatus | null {
  if ((DOSSIER_STATUSES as readonly string[]).includes(value)) {
    return value as DossierStatus;
  }
  return null;
}

export async function getExploreCatalog(
  client?: DbClient,
): Promise<ExploreCatalog> {
  const supabase = await resolveDb(client);

  const [
    instrumentsResult,
    themesResult,
    linksResult,
    dossiersResult,
    positionsResult,
    setupsResult,
  ] = await Promise.all([
    supabase
      .from("instruments")
      .select("id, symbol, name")
      .neq("status", "archived")
      .eq("is_benchmark", false)
      .order("symbol", { ascending: true }),
    supabase
      .from("themes")
      .select("id, slug, name, description, is_core")
      .order("sort_order", { ascending: true }),
    supabase
      .from("instrument_themes")
      .select("instrument_id, theme_id, is_primary")
      .eq("is_primary", true),
    supabase.from("dossiers").select("instrument_id, status, next_review_at"),
    supabase.from("positions").select("instrument_id").eq("status", "open"),
    supabase
      .from("instrument_setups")
      .select("instrument_id, setup, stale")
      .eq("scorer_key", INFLECTION_SCORER_KEY),
  ]);

  if (instrumentsResult.error) {
    throw new Error(
      `Failed to load instruments: ${instrumentsResult.error.message}`,
    );
  }
  if (themesResult.error) {
    throw new Error(`Failed to load themes: ${themesResult.error.message}`);
  }
  if (linksResult.error) {
    throw new Error(
      `Failed to load instrument themes: ${linksResult.error.message}`,
    );
  }
  if (dossiersResult.error) {
    throw new Error(`Failed to load dossiers: ${dossiersResult.error.message}`);
  }
  if (positionsResult.error) {
    throw new Error(
      `Failed to load positions: ${positionsResult.error.message}`,
    );
  }
  if (setupsResult.error) {
    throw new Error(
      `Failed to load instrument setups: ${setupsResult.error.message}`,
    );
  }

  const instruments = (instrumentsResult.data as InstrumentRow[] | null) ?? [];
  const themeRows = (themesResult.data as ThemeRow[] | null) ?? [];
  const links = (linksResult.data as ThemeLink[] | null) ?? [];
  const dossiers = (dossiersResult.data as DossierRow[] | null) ?? [];
  const setups = (setupsResult.data as SetupRow[] | null) ?? [];
  const heldIds = new Set(
    ((positionsResult.data as { instrument_id: string }[] | null) ?? []).map(
      (row) => row.instrument_id,
    ),
  );

  const themesById = new Map(themeRows.map((theme) => [theme.id, theme]));
  const primaryThemeByInstrument = new Map(
    links.map((link) => [link.instrument_id, link.theme_id]),
  );
  const dossierByInstrument = new Map(
    dossiers.map((row) => [row.instrument_id, row]),
  );
  const setupByInstrument = new Map(
    setups.map((row) => [row.instrument_id, row]),
  );

  const barsByInstrument = new Map<string, PricePoint[]>();
  if (instruments.length > 0) {
    const barStart = new Date();
    barStart.setUTCMonth(barStart.getUTCMonth() - 2);
    const barStartIso = barStart.toISOString().slice(0, 10);
    const ids = instruments.map((row) => row.id);

    for (let page = 0; ; page += 1) {
      const { data, error } = await supabase
        .from("market_bars")
        .select("instrument_id, bar_date, close, adj_close")
        .in("instrument_id", ids)
        .gte("bar_date", barStartIso)
        .order("instrument_id", { ascending: true })
        .order("bar_date", { ascending: true })
        .range(page * BAR_PAGE_SIZE, (page + 1) * BAR_PAGE_SIZE - 1);
      if (error) {
        throw new Error(`Failed to load bars: ${error.message}`);
      }
      const batch = (data as BarRow[] | null) ?? [];
      for (const row of batch) {
        const close = row.adj_close ?? row.close;
        if (close == null) continue;
        const points = barsByInstrument.get(row.instrument_id) ?? [];
        points.push({ date: row.bar_date, close: Number(close) });
        barsByInstrument.set(row.instrument_id, points);
      }
      if (batch.length < BAR_PAGE_SIZE) break;
    }
  }

  const names: ExploreName[] = instruments
    .map((instrument) => {
      const themeId = primaryThemeByInstrument.get(instrument.id);
      const theme = themeId ? themesById.get(themeId) : undefined;
      if (!theme) return null;
      const dossier = dossierByInstrument.get(instrument.id);
      const setup = setupByInstrument.get(instrument.id);
      return {
        id: instrument.id,
        symbol: instrument.symbol,
        name: instrument.name,
        themeSlug: theme.slug,
        themeName: theme.name,
        held: heldIds.has(instrument.id),
        hasDossier: dossier != null,
        dossierStatus: dossier ? asDossierStatus(dossier.status) : null,
        nextReviewAt: dossier?.next_review_at ?? null,
        return1m: computeReturnPct(
          barsByInstrument.get(instrument.id) ?? [],
          "1m",
        ),
        setup: setup ? asInflectionSetup(setup.setup) : null,
        setupStale: setup?.stale ?? false,
      } satisfies ExploreName;
    })
    .filter((row): row is ExploreName => row !== null);

  return {
    themes: themeRows.map((theme) => ({
      slug: theme.slug,
      name: theme.name,
      description: theme.description,
      isCore: theme.is_core,
    })),
    names,
  };
}
