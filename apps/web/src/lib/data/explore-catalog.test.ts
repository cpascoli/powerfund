import { describe, expect, it } from "vitest";

import type { ExploreName } from "./explore-catalog";
import {
  exploreDossierLabel,
  exploreEmptyCopy,
  exploreHref,
  exploreSetupTags,
  exploreThemeCounts,
  filterExploreNames,
  isStaleReview,
  parseExploreFocus,
  parseExploreTheme,
  sortExploreNames,
} from "./explore-catalog";

function name(overrides: Partial<ExploreName> & Pick<ExploreName, "symbol">): ExploreName {
  return {
    id: overrides.symbol,
    name: overrides.name ?? overrides.symbol,
    themeSlug: "power",
    themeName: "Power",
    held: false,
    hasDossier: true,
    dossierStatus: "watch",
    nextReviewAt: null,
    return1m: 0,
    setup: null,
    setupCompleteness: null,
    setupStale: false,
    ...overrides,
  };
}

const saturday = new Date("2026-08-22T15:00:00Z");

describe("explore catalog query parsing", () => {
  it("defaults unknown focus and theme to all", () => {
    expect(parseExploreFocus(undefined)).toBe("all");
    expect(parseExploreFocus("held")).toBe("held");
    expect(parseExploreFocus("needs_dossier")).toBe("all");
    expect(parseExploreFocus("stale_review")).toBe("all");
    expect(parseExploreFocus("nope")).toBe("all");
    expect(parseExploreTheme("power", [{ slug: "power" }])).toBe("power");
    expect(parseExploreTheme("missing", [{ slug: "power" }])).toBe("all");
    expect(parseExploreTheme(undefined, [{ slug: "power" }])).toBe("all");
  });

  it("omits default filters from the shareable URL", () => {
    expect(exploreHref({ theme: "all", focus: "all", query: "" })).toBe("/explore");
    expect(
      exploreHref({ theme: "power", focus: "held", query: " cls " }),
    ).toBe("/explore?theme=power&focus=held&q=cls");
  });
});

describe("explore catalog filters", () => {
  const rows = [
    name({
      symbol: "VRT",
      name: "Vertiv",
      held: true,
      hasDossier: true,
      dossierStatus: "active_thesis",
      nextReviewAt: "2026-08-01",
      return1m: 12.4,
    }),
    name({
      symbol: "CLS",
      name: "Celestica",
      themeSlug: "ai-infrastructure",
      themeName: "AI Infrastructure",
      held: true,
      hasDossier: false,
      dossierStatus: null,
      return1m: 8.2,
    }),
    name({
      symbol: "APH",
      name: "Amphenol",
      held: false,
      hasDossier: true,
      dossierStatus: "investigate",
      nextReviewAt: "2026-09-01",
      return1m: -3.1,
    }),
    name({
      symbol: "FIX",
      name: "Comfort Systems",
      held: false,
      hasDossier: false,
      dossierStatus: null,
      return1m: null,
    }),
  ];

  it("treats a review date on or before today UTC as stale", () => {
    expect(isStaleReview("2026-08-22", saturday)).toBe(true);
    expect(isStaleReview("2026-08-22T23:00:00Z", saturday)).toBe(true);
    expect(isStaleReview("2026-08-23", saturday)).toBe(false);
    expect(isStaleReview(null, saturday)).toBe(false);
  });

  it("filters by theme, held, missing dossier, and due review", () => {
    expect(
      filterExploreNames(rows, { theme: "power", focus: "all", query: "" }).map(
        (row) => row.symbol,
      ),
    ).toEqual(["VRT", "APH", "FIX"]);
    expect(
      filterExploreNames(rows, {
        theme: "all",
        focus: "held",
        query: "",
      }).map((row) => row.symbol),
    ).toEqual(["VRT", "CLS"]);
  });

  it("matches ticker, name, or theme against the query", () => {
    expect(
      filterExploreNames(rows, {
        theme: "all",
        focus: "all",
        query: "cele",
      }).map((row) => row.symbol),
    ).toEqual(["CLS"]);
    expect(
      filterExploreNames(rows, {
        theme: "all",
        focus: "all",
        query: "ai infra",
      }).map((row) => row.symbol),
    ).toEqual(["CLS"]);
  });

  it("counts theme chips after focus and query", () => {
    const counts = exploreThemeCounts(rows, "held", "");
    expect(counts.get("power")).toBe(1);
    expect(counts.get("ai-infrastructure")).toBe(1);
  });
});

describe("explore catalog sort and labels", () => {
  it("sorts 1m descending with nulls last", () => {
    const rows = [
      name({ symbol: "FIX", return1m: null }),
      name({ symbol: "APH", return1m: -1 }),
      name({ symbol: "VRT", return1m: 10 }),
      name({ symbol: "CLS", return1m: 10 }),
    ];
    expect(
      sortExploreNames(rows, "return_1m", "desc").map((row) => row.symbol),
    ).toEqual(["CLS", "VRT", "APH", "FIX"]);
  });

  it("tags partial completeness separately from stale", () => {
    expect(
      exploreSetupTags(
        name({
          symbol: "VRT",
          setup: "correction_candidate",
          setupCompleteness: "partial",
          setupStale: false,
        }),
      ),
    ).toEqual(["partial"]);
    expect(
      exploreSetupTags(
        name({
          symbol: "VRT",
          setup: "correction_candidate",
          setupCompleteness: "partial",
          setupStale: true,
        }),
      ),
    ).toEqual(["partial", "stale"]);
  });

  it("sorts setup by research priority with missing last", () => {
    const rows = [
      name({ symbol: "FIX", setup: null }),
      name({ symbol: "APH", setup: "watch" }),
      name({ symbol: "VRT", setup: "correction_candidate" }),
      name({ symbol: "CLS", setup: "improving_research" }),
    ];
    expect(
      sortExploreNames(rows, "setup", "asc").map((row) => row.symbol),
    ).toEqual(["VRT", "CLS", "APH", "FIX"]);
  });

  it("labels dossier status and empty states", () => {
    expect(
      exploreDossierLabel(
        name({ symbol: "X", hasDossier: false, dossierStatus: null }),
      ),
    ).toBe("none");
    expect(
      exploreDossierLabel(
        name({
          symbol: "Y",
          hasDossier: true,
          dossierStatus: "active_thesis",
        }),
      ),
    ).toBe("active");
    expect(
      exploreEmptyCopy({
        themeName: "Power",
        focus: "held",
        query: "",
      }),
    ).toBe("No held names in Power.");
    expect(
      exploreEmptyCopy({
        themeName: null,
        focus: "all",
        query: "zzz",
      }),
    ).toBe("No names matching “zzz”.");
  });
});
