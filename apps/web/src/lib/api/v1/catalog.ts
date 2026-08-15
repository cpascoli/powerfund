import { getPlaybookDoc, loadPlaybookMarkdown } from "@/lib/docs";
import { createAdminClient } from "@/lib/supabase/admin";

export type PublicTheme = {
  slug: string;
  name: string;
  description: string | null;
  is_core: boolean;
  sort_order: number;
};

export type PublicWatchName = {
  symbol: string;
  name: string;
  asset_class: string;
  status: string;
  theme: { slug: string; name: string };
  has_dossier: boolean;
};

export type PublicDossier = {
  status: string;
  summary: string;
  thesis: string | null;
  catalysts: string | null;
  risks: string | null;
  competitive_notes: string | null;
  next_diligence: string | null;
  source: string | null;
  updated_at: string;
};

export type PublicCompany = {
  symbol: string;
  name: string;
  asset_class: string;
  status: string;
  theme: { slug: string; name: string };
  dossier: PublicDossier | null;
};

export type PlaybookPayload = {
  slug: string;
  title: string;
  description: string;
  markdown: string;
};

export async function loadPlaybook(slug: string): Promise<PlaybookPayload> {
  const doc = getPlaybookDoc(slug);
  if (!doc) {
    throw new Error(`Unknown playbook slug: ${slug}`);
  }
  const markdown = await loadPlaybookMarkdown(doc.file);
  return {
    slug: doc.slug,
    title: doc.title,
    description: doc.description,
    markdown,
  };
}

export async function listPublicThemes(): Promise<PublicTheme[]> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const { data, error } = await supabase
    .from("themes")
    .select("slug, name, description, is_core, sort_order")
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`Failed to load themes: ${error.message}`);
  }

  return (data as PublicTheme[] | null) ?? [];
}

export async function listPublicWatchlist(): Promise<PublicWatchName[]> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const [instrumentsResult, linksResult, themesResult, dossiersResult] =
    await Promise.all([
      supabase
        .from("instruments")
        .select("id, symbol, name, asset_class, status")
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

  const instruments =
    (instrumentsResult.data as Array<{
      id: string;
      symbol: string;
      name: string;
      asset_class: string;
      status: string;
    }> | null) ?? [];
  const links =
    (linksResult.data as Array<{
      instrument_id: string;
      theme_id: string;
      is_primary: boolean;
    }> | null) ?? [];
  const themes =
    (themesResult.data as Array<{
      id: string;
      slug: string;
      name: string;
    }> | null) ?? [];
  const dossierIds = new Set(
    ((dossiersResult.data as Array<{ instrument_id: string }> | null) ?? []).map(
      (row) => row.instrument_id,
    ),
  );

  const themesById = new Map(themes.map((theme) => [theme.id, theme]));
  const themeIdByInstrument = new Map(
    links.map((link) => [link.instrument_id, link.theme_id]),
  );

  return instruments
    .map((instrument) => {
      const themeId = themeIdByInstrument.get(instrument.id);
      const theme = themeId ? themesById.get(themeId) : undefined;
      if (!theme) return null;
      return {
        symbol: instrument.symbol,
        name: instrument.name,
        asset_class: instrument.asset_class,
        status: instrument.status,
        theme: { slug: theme.slug, name: theme.name },
        has_dossier: dossierIds.has(instrument.id),
      } satisfies PublicWatchName;
    })
    .filter((row): row is PublicWatchName => row !== null)
    .sort((a, b) => {
      const themeCmp = a.theme.name.localeCompare(b.theme.name);
      if (themeCmp !== 0) return themeCmp;
      return a.symbol.localeCompare(b.symbol);
    });
}

export async function getPublicCompany(
  symbol: string,
): Promise<PublicCompany | null> {
  const normalized = symbol.trim().toUpperCase();
  const watchlist = await listPublicWatchlist();
  const name = watchlist.find((row) => row.symbol === normalized);
  if (!name) return null;

  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const { data: instrument, error: instrumentError } = await supabase
    .from("instruments")
    .select("id")
    .eq("symbol", normalized)
    .maybeSingle();

  if (instrumentError) {
    throw new Error(`Failed to load instrument: ${instrumentError.message}`);
  }
  if (!instrument) return null;

  const { data, error } = await supabase
    .from("dossiers")
    .select(
      "status, summary, thesis, catalysts, risks, competitive_notes, next_diligence, source, updated_at",
    )
    .eq("instrument_id", instrument.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load dossier: ${error.message}`);
  }

  return {
    symbol: name.symbol,
    name: name.name,
    asset_class: name.asset_class,
    status: name.status,
    theme: name.theme,
    dossier: (data as PublicDossier | null) ?? null,
  };
}

export function playbookMarkdown(doc: PlaybookPayload): string {
  return doc.markdown;
}

export function themesMarkdown(
  playbook: PlaybookPayload,
  themes: PublicTheme[],
): string {
  const rows = themes
    .map(
      (theme) =>
        `- **${theme.name}** (\`${theme.slug}\`)${theme.is_core ? " — core" : ""}${theme.description ? `: ${theme.description}` : ""}`,
    )
    .join("\n");
  return `# Themes\n\n## Universe\n\n${rows}\n\n## Playbook\n\n${playbook.markdown}\n`;
}

export function watchlistMarkdown(names: PublicWatchName[]): string {
  const lines = [
    "# Watchlist",
    "",
    "| Symbol | Name | Theme | Status | Dossier |",
    "| --- | --- | --- | --- | --- |",
    ...names.map(
      (row) =>
        `| ${row.symbol} | ${row.name} | ${row.theme.name} | ${row.status} | ${row.has_dossier ? "yes" : "no"} |`,
    ),
    "",
  ];
  return lines.join("\n");
}

export function companyMarkdown(company: PublicCompany): string {
  const dossier = company.dossier;
  const sections = [
    `# ${company.symbol} — ${company.name}`,
    "",
    `- Theme: ${company.theme.name} (\`${company.theme.slug}\`)`,
    `- Status: ${company.status}`,
    `- Asset class: ${company.asset_class}`,
    "",
  ];

  if (!dossier) {
    sections.push("No dossier published yet.", "");
    return sections.join("\n");
  }

  sections.push(`- Dossier status: ${dossier.status}`);
  if (dossier.source) sections.push(`- Source: ${dossier.source}`);
  sections.push(`- Updated: ${dossier.updated_at}`, "");
  sections.push("## Summary", "", dossier.summary, "");
  if (dossier.thesis) sections.push("## Thesis", "", dossier.thesis, "");
  if (dossier.catalysts) sections.push("## Catalysts", "", dossier.catalysts, "");
  if (dossier.risks) sections.push("## Risks", "", dossier.risks, "");
  if (dossier.competitive_notes) {
    sections.push("## Competitive notes", "", dossier.competitive_notes, "");
  }
  if (dossier.next_diligence) {
    sections.push("## Next diligence", "", dossier.next_diligence, "");
  }
  return sections.join("\n");
}
