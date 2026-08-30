"use client";

import { inflectionSetupLabel } from "@powerfund/domain";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  EXPLORE_FOCUS_ITEMS,
  exploreBookLabel,
  exploreDossierLabel,
  exploreEmptyCopy,
  exploreSetupTags,
  exploreThemeCounts,
  filterExploreNames,
  isStaleReview,
  replaceExploreSearch,
  sortExploreNames,
  type ExploreFocus,
  type ExploreName,
  type ExploreSort,
  type ExploreSortDir,
  type ExploreTheme,
} from "@/lib/data/explore-catalog";

type ExploreCatalogProps = {
  themes: ExploreTheme[];
  names: ExploreName[];
  initialTheme: string;
  initialFocus: ExploreFocus;
  initialQuery: string;
};

function formatPct(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function toneClass(value: number | null): string {
  if (value == null || Number.isNaN(value) || value === 0) return "catalog-num";
  return value > 0 ? "catalog-num is-up" : "catalog-num is-down";
}

function defaultDir(sort: ExploreSort): ExploreSortDir {
  switch (sort) {
    case "return_1m":
    case "book":
      return "desc";
    case "symbol":
    case "name":
    case "theme":
    case "setup":
    case "dossier":
      return "asc";
    default: {
      const _exhaustive: never = sort;
      return _exhaustive;
    }
  }
}

function sortMark(active: boolean, dir: ExploreSortDir): string {
  if (!active) return "";
  return dir === "asc" ? " ↑" : " ↓";
}

function ariaSort(
  column: ExploreSort,
  sort: ExploreSort,
  dir: ExploreSortDir,
): "ascending" | "descending" | "none" {
  if (column !== sort) return "none";
  return dir === "asc" ? "ascending" : "descending";
}

export function ExploreCatalog({
  themes,
  names,
  initialTheme,
  initialFocus,
  initialQuery,
}: ExploreCatalogProps) {
  const [theme, setTheme] = useState(initialTheme);
  const [focus, setFocus] = useState<ExploreFocus>(initialFocus);
  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState<ExploreSort>("return_1m");
  const [dir, setDir] = useState<ExploreSortDir>("desc");
  const router = useRouter();

  function commit(next: {
    theme: string;
    focus: ExploreFocus;
    query: string;
  }) {
    replaceExploreSearch(next);
  }

  function selectTheme(next: string) {
    setTheme(next);
    commit({ theme: next, focus, query });
  }

  function selectFocus(next: ExploreFocus) {
    setFocus(next);
    commit({ theme, focus: next, query });
  }

  function selectQuery(next: string) {
    setQuery(next);
    commit({ theme, focus, query: next });
  }

  function selectSort(next: ExploreSort) {
    if (next === sort) {
      setDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSort(next);
    setDir(defaultDir(next));
  }

  const selected = themes.find((row) => row.slug === theme) ?? null;
  const chipCounts = exploreThemeCounts(names, focus, query);
  const allCount = [...chipCounts.values()].reduce((sum, n) => sum + n, 0);

  const filtered = useMemo(
    () => filterExploreNames(names, { theme, focus, query }),
    [names, theme, focus, query],
  );
  const rows = useMemo(
    () => sortExploreNames(filtered, sort, dir),
    [filtered, sort, dir],
  );

  const scoped = theme === "all" ? names : names.filter((row) => row.themeSlug === theme);
  const heldCount = scoped.filter((row) => row.held).length;
  const missingCount = scoped.filter((row) => !row.hasDossier).length;
  const staleCount = scoped.filter((row) => isStaleReview(row.nextReviewAt)).length;
  const showThemeColumn = theme === "all";
  const workbenchHref =
    theme === "all" ? "/workbench" : `/workbench?theme=${encodeURIComponent(theme)}`;

  return (
    <section className="panel" aria-label="Research universe">
      <div className="price-panel-head">
        <div>
          <h2>
            {selected ? selected.name : "Universe"}
            {selected ? (
              <>
                {" "}
                <span className="tag">
                  {selected.isCore ? "core" : "explore"}
                </span>
              </>
            ) : null}
          </h2>
          <p className="muted">
            {scoped.length === 1 ? "1 name" : `${scoped.length} names`}
            {` · ${heldCount} held`}
            {missingCount > 0 ? ` · ${missingCount} need a dossier` : ""}
            {staleCount > 0 ? ` · ${staleCount} review date due` : ""}
          </p>
        </div>
        <Link className="buttonish subtle" href={workbenchHref}>
          Compare in Workbench
        </Link>
      </div>

      <div className="chip-row" role="group" aria-label="Theme">
        <button
          type="button"
          className={theme === "all" ? "is-active" : undefined}
          aria-pressed={theme === "all"}
          onClick={() => selectTheme("all")}
        >
          All <span>{allCount}</span>
        </button>
        {themes.map((row) => (
          <button
            key={row.slug}
            type="button"
            className={row.slug === theme ? "is-active" : undefined}
            aria-pressed={row.slug === theme}
            onClick={() => selectTheme(row.slug)}
          >
            {row.name} <span>{chipCounts.get(row.slug) ?? 0}</span>
          </button>
        ))}
      </div>

      {selected?.description ? (
        <p className="theme-blurb">{selected.description}</p>
      ) : null}

      <div className="upcoming-filters">
        <div className="seg" role="group" aria-label="Focus">
          {EXPLORE_FOCUS_ITEMS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={entry.id === focus ? "is-active" : undefined}
              aria-pressed={entry.id === focus}
              onClick={() => selectFocus(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className="workbench-controls">
          <label>
            Filter
            <input
              type="search"
              value={query}
              placeholder="Ticker or name"
              onChange={(event) => selectQuery(event.target.value)}
            />
          </label>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="empty">
          {exploreEmptyCopy({
            themeName: selected?.name ?? null,
            focus,
            query,
          })}
        </p>
      ) : (
        <table className="agenda catalog">
          <thead>
            <tr>
              <th scope="col" aria-sort={ariaSort("symbol", sort, dir)}>
                <button type="button" onClick={() => selectSort("symbol")}>
                  Ticker{sortMark(sort === "symbol", dir)}
                </button>
              </th>
              <th scope="col" aria-sort={ariaSort("name", sort, dir)}>
                <button type="button" onClick={() => selectSort("name")}>
                  Name{sortMark(sort === "name", dir)}
                </button>
              </th>
              {showThemeColumn ? (
                <th
                  className="catalog-hide-narrow"
                  scope="col"
                  aria-sort={ariaSort("theme", sort, dir)}
                >
                  <button type="button" onClick={() => selectSort("theme")}>
                    Theme{sortMark(sort === "theme", dir)}
                  </button>
                </th>
              ) : null}
              <th
                className="catalog-num"
                scope="col"
                aria-sort={ariaSort("return_1m", sort, dir)}
              >
                <button type="button" onClick={() => selectSort("return_1m")}>
                  1M{sortMark(sort === "return_1m", dir)}
                </button>
              </th>
              <th scope="col" aria-sort={ariaSort("setup", sort, dir)}>
                <button type="button" onClick={() => selectSort("setup")}>
                  Setup{sortMark(sort === "setup", dir)}
                </button>
              </th>
              <th scope="col" aria-sort={ariaSort("dossier", sort, dir)}>
                <button type="button" onClick={() => selectSort("dossier")}>
                  Dossier{sortMark(sort === "dossier", dir)}
                </button>
              </th>
              <th
                className="catalog-hide-narrow"
                scope="col"
                aria-sort={ariaSort("book", sort, dir)}
              >
                <button type="button" onClick={() => selectSort("book")}>
                  Book{sortMark(sort === "book", dir)}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const dossier = exploreDossierLabel(row);
              const stale = isStaleReview(row.nextReviewAt);
              return (
                <tr
                  key={row.id}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("a")) return;
                    router.push(`/explore/${row.symbol}`);
                  }}
                >
                  <td>
                    <Link href={`/explore/${row.symbol}`}>
                      <strong>{row.symbol}</strong>
                    </Link>
                  </td>
                  <td>
                    <Link href={`/explore/${row.symbol}`}>{row.name}</Link>
                  </td>
                  {showThemeColumn ? (
                    <td className="catalog-hide-narrow muted">{row.themeName}</td>
                  ) : null}
                  <td className={toneClass(row.return1m)}>{formatPct(row.return1m)}</td>
                  <td>
                    {row.setup == null ? (
                      <span className="muted">—</span>
                    ) : (
                      <span className="tag">{inflectionSetupLabel(row.setup)}</span>
                    )}
                    {exploreSetupTags(row).map((tag) => (
                      <span key={tag} className="tag warn">
                        {tag}
                      </span>
                    ))}
                  </td>
                  <td>
                    {dossier === "none" ? (
                      <span className="muted">none</span>
                    ) : (
                      <span className="tag">{dossier}</span>
                    )}
                    {stale ? <span className="tag warn">due</span> : null}
                  </td>
                  <td className="catalog-hide-narrow">
                    {row.held ? (
                      <span className="tag">{exploreBookLabel(true)}</span>
                    ) : (
                      <span className="muted">{exploreBookLabel(false)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
