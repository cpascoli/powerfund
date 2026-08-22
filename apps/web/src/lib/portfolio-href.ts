import { isNavChartView, type NavChartView } from "@/lib/data/nav-series";

export const STATS_TABS = ["book", "score", "deployment"] as const;
export type StatsTab = (typeof STATS_TABS)[number];

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
