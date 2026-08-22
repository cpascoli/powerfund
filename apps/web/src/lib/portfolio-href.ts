import { isNavChartView, type NavChartView } from "@/lib/data/nav-series";

export const STATS_TABS = ["book", "score", "deployment"] as const;
export type StatsTab = (typeof STATS_TABS)[number];

export const STAT_TAB_ITEMS: Array<{ id: StatsTab; label: string }> = [
  { id: "book", label: "Book" },
  { id: "score", label: "Score" },
  { id: "deployment", label: "Deployment" },
];

export const CHART_TABS: Array<{ id: NavChartView; label: string }> = [
  { id: "nav", label: "NAV" },
  { id: "change", label: "Daily change" },
  { id: "pnl", label: "P&L" },
];

export type ChartTab = NavChartView;

export type PortfolioSectionTab =
  | "book"
  | "queue"
  | "mandate"
  | "performance"
  | "ledger";

export const SECTION_TAB_ITEMS: Array<{
  id: PortfolioSectionTab;
  label: string;
}> = [
  { id: "book", label: "Open book" },
  { id: "queue", label: "Deployment queue" },
  { id: "mandate", label: "Mandate" },
  { id: "performance", label: "Performance" },
  { id: "ledger", label: "Ledger" },
];

const FORM_QUERY_KEYS = ["add", "cash", "plan", "confirm", "sell"] as const;

export type PortfolioQuery = {
  stats?: StatsTab;
  chart?: ChartTab;
  tab?: PortfolioSectionTab;
  add?: string;
  cash?: string;
  plan?: string;
  confirm?: string;
  sell?: string;
};

export function parseStatsTab(raw: string | undefined): StatsTab {
  switch (raw) {
    case "book":
    case "score":
    case "deployment":
      return raw;
    default:
      return "book";
  }
}

export function parseChartTab(raw: string | undefined): ChartTab {
  return isNavChartView(raw) ? raw : "nav";
}

export function parseSectionTab(
  raw: string | undefined,
): PortfolioSectionTab | null {
  switch (raw) {
    case "book":
    case "queue":
    case "mandate":
    case "performance":
    case "ledger":
      return raw;
    default:
      return null;
  }
}

/** Shareable portfolio URL. Omits default stats/chart/tab so the path stays short. */
export function portfolioHref(query: PortfolioQuery): string {
  const params = new URLSearchParams();
  if (query.stats != null && query.stats !== "book") {
    params.set("stats", query.stats);
  }
  if (query.chart != null && query.chart !== "nav") {
    params.set("chart", query.chart);
  }
  if (query.tab != null && query.tab !== "book") {
    params.set("tab", query.tab);
  }
  if (query.add) params.set("add", query.add);
  if (query.cash) params.set("cash", query.cash);
  if (query.plan) params.set("plan", query.plan);
  if (query.confirm) params.set("confirm", query.confirm);
  if (query.sell) params.set("sell", query.sell);
  const qs = params.toString();
  return qs.length > 0 ? `/portfolio?${qs}` : "/portfolio";
}

/**
 * Update one portfolio query key without a Next.js navigation
 * (no refresh, no scroll-to-top).
 */
export function replacePortfolioSearchParam(
  key: "stats" | "chart",
  value: string,
  defaultValue: string,
): void {
  const url = new URL(window.location.href);
  if (value === defaultValue) {
    url.searchParams.delete(key);
  } else {
    url.searchParams.set(key, value);
  }
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

/** Switch the lower portfolio section without a navigation; drop in-progress forms. */
export function applySectionTabToSearch(
  search: URLSearchParams,
  tab: PortfolioSectionTab,
): URLSearchParams {
  const next = new URLSearchParams(search);
  if (tab === "book") {
    next.delete("tab");
  } else {
    next.set("tab", tab);
  }
  for (const key of FORM_QUERY_KEYS) {
    next.delete(key);
  }
  return next;
}

export function replacePortfolioSectionTab(tab: PortfolioSectionTab): void {
  const url = new URL(window.location.href);
  const next = applySectionTabToSearch(url.searchParams, tab);
  const qs = next.toString();
  window.history.replaceState(
    window.history.state,
    "",
    qs.length > 0 ? `${url.pathname}?${qs}${url.hash}` : `${url.pathname}${url.hash}`,
  );
}
