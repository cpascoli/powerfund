import {
  inflectionSetupRank,
  type Completeness,
  type DossierStatus,
  type InflectionSetup,
} from "@powerfund/domain";

export const EXPLORE_FOCUSES = ["all", "held"] as const;

export type ExploreFocus = (typeof EXPLORE_FOCUSES)[number];

export const EXPLORE_FOCUS_ITEMS: Array<{ id: ExploreFocus; label: string }> = [
  { id: "all", label: "All" },
  { id: "held", label: "Held" },
];

export const EXPLORE_SORTS = [
  "symbol",
  "name",
  "theme",
  "return_1m",
  "setup",
  "dossier",
  "book",
] as const;

export type ExploreSort = (typeof EXPLORE_SORTS)[number];

export type ExploreSortDir = "asc" | "desc";

export type ExploreTheme = {
  slug: string;
  name: string;
  description: string | null;
  isCore: boolean;
};

export type ExploreName = {
  id: string;
  symbol: string;
  name: string;
  themeSlug: string;
  themeName: string;
  held: boolean;
  hasDossier: boolean;
  dossierStatus: DossierStatus | null;
  nextReviewAt: string | null;
  return1m: number | null;
  setup: InflectionSetup | null;
  setupCompleteness: Completeness | null;
  setupStale: boolean;
};

export function parseExploreFocus(value: string | undefined): ExploreFocus {
  if (value && (EXPLORE_FOCUSES as readonly string[]).includes(value)) {
    return value as ExploreFocus;
  }
  return "all";
}

export function parseExploreTheme(
  value: string | undefined,
  themes: Array<{ slug: string }>,
): string {
  const slug = value?.trim() ?? "";
  if (slug.length > 0 && themes.some((theme) => theme.slug === slug)) {
    return slug;
  }
  return "all";
}

export function utcDayStamp(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function isStaleReview(
  nextReviewAt: string | null,
  now = new Date(),
): boolean {
  if (nextReviewAt == null || nextReviewAt.trim().length === 0) {
    return false;
  }
  return nextReviewAt.slice(0, 10) <= utcDayStamp(now);
}

export function exploreDossierLabel(row: ExploreName): string {
  if (!row.hasDossier) return "none";
  const status = row.dossierStatus;
  if (status == null) return "dossier";
  switch (status) {
    case "watch":
      return "watch";
    case "investigate":
      return "investigate";
    case "active_thesis":
      return "active";
    case "passed":
      return "passed";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function exploreBookLabel(held: boolean): string {
  return held ? "held" : "watch";
}

export function exploreSetupTags(
  row: ExploreName,
): Array<"partial" | "stale"> {
  const tags: Array<"partial" | "stale"> = [];
  if (row.setup != null && row.setupCompleteness === "partial") {
    tags.push("partial");
  }
  if (row.setupStale) tags.push("stale");
  return tags;
}

function matchesQuery(row: ExploreName, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;
  return (
    row.symbol.toLowerCase().includes(needle) ||
    row.name.toLowerCase().includes(needle) ||
    row.themeName.toLowerCase().includes(needle)
  );
}

function matchesFocus(
  row: ExploreName,
  focus: ExploreFocus,
): boolean {
  switch (focus) {
    case "all":
      return true;
    case "held":
      return row.held;
    default: {
      const _exhaustive: never = focus;
      return _exhaustive;
    }
  }
}

export function filterExploreNames(
  names: ExploreName[],
  args: {
    theme: string;
    focus: ExploreFocus;
    query: string;
  },
): ExploreName[] {
  return names.filter((row) => {
    if (args.theme !== "all" && row.themeSlug !== args.theme) return false;
    if (!matchesFocus(row, args.focus)) return false;
    return matchesQuery(row, args.query);
  });
}

function compareNullableNumber(
  a: number | null,
  b: number | null,
  dir: ExploreSortDir,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const cmp = a - b;
  return dir === "asc" ? cmp : -cmp;
}

export function sortExploreNames(
  names: ExploreName[],
  sort: ExploreSort,
  dir: ExploreSortDir,
): ExploreName[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...names].sort((a, b) => {
    let cmp = 0;
    switch (sort) {
      case "symbol":
        cmp = a.symbol.localeCompare(b.symbol);
        break;
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "theme":
        cmp = a.themeName.localeCompare(b.themeName);
        if (cmp === 0) cmp = a.symbol.localeCompare(b.symbol);
        break;
      case "return_1m":
        cmp = compareNullableNumber(a.return1m, b.return1m, dir);
        if (cmp !== 0) return cmp;
        return a.symbol.localeCompare(b.symbol);
      case "setup":
        cmp = compareNullableNumber(
          inflectionSetupRank(a.setup),
          inflectionSetupRank(b.setup),
          dir,
        );
        if (cmp !== 0) return cmp;
        return a.symbol.localeCompare(b.symbol);
      case "dossier":
        cmp = exploreDossierLabel(a).localeCompare(exploreDossierLabel(b));
        break;
      case "book":
        cmp = Number(a.held) - Number(b.held);
        break;
      default: {
        const _exhaustive: never = sort;
        return _exhaustive;
      }
    }
    if (cmp !== 0) return cmp * sign;
    return a.symbol.localeCompare(b.symbol);
  });
}

export function exploreThemeCounts(
  names: ExploreName[],
  focus: ExploreFocus,
  query: string,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of names) {
    if (!matchesFocus(row, focus)) continue;
    if (!matchesQuery(row, query)) continue;
    counts.set(row.themeSlug, (counts.get(row.themeSlug) ?? 0) + 1);
  }
  return counts;
}

export function exploreEmptyCopy(args: {
  themeName: string | null;
  focus: ExploreFocus;
  query: string;
}): string {
  const q = args.query.trim();
  const inTheme = args.themeName ? ` in ${args.themeName}` : "";
  const match = q.length > 0 ? ` matching “${q}”` : "";
  switch (args.focus) {
    case "held":
      return `No held names${inTheme}${match}.`;
    case "all":
      if (q.length > 0) {
        return args.themeName
          ? `No names in ${args.themeName} matching “${q}”.`
          : `No names matching “${q}”.`;
      }
      return args.themeName
        ? `No instruments linked to ${args.themeName} yet.`
        : "No instruments yet. Run pnpm db:reset to seed the starter universe.";
    default: {
      const _exhaustive: never = args.focus;
      return _exhaustive;
    }
  }
}

export function exploreHref(args: {
  theme: string;
  focus: ExploreFocus;
  query: string;
}): string {
  const params = new URLSearchParams();
  if (args.theme !== "all") params.set("theme", args.theme);
  if (args.focus !== "all") params.set("focus", args.focus);
  const q = args.query.trim();
  if (q.length > 0) params.set("q", q);
  const qs = params.toString();
  return qs.length > 0 ? `/explore?${qs}` : "/explore";
}

export function replaceExploreSearch(args: {
  theme: string;
  focus: ExploreFocus;
  query: string;
}): void {
  window.history.replaceState(window.history.state, "", exploreHref(args));
}
