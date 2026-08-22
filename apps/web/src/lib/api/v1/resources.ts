export const API_VERSION = "1.0.0";

export const PUBLIC_RESOURCES = [
  {
    path: "/api/v1",
    title: "Catalog index",
    description: "Lists public resources and what is intentionally held back.",
  },
  {
    path: "/api/v1/openapi.json",
    title: "OpenAPI",
    description: "Machine-readable schema for this catalog.",
  },
  {
    path: "/api/v1/mandate",
    title: "Mandate",
    description: "Investment constitution, risk rules, and process.",
  },
  {
    path: "/api/v1/goals",
    title: "Goals",
    description: "Why Power Fund exists and what success looks like.",
  },
  {
    path: "/api/v1/themes",
    title: "Themes",
    description: "Theme taxonomy plus the themes playbook.",
  },
  {
    path: "/api/v1/watchlist",
    title: "Watchlist",
    description: "Research universe: symbol, name, theme, status. No dollars.",
  },
  {
    path: "/api/v1/companies/{symbol}",
    title: "Company dossier",
    description:
      "Published research stub: thesis, risks, invalidation, next diligence.",
  },
  {
    path: "/api/v1/portfolio",
    title: "Portfolio",
    description:
      "Open book as NAV weights and theme mix. No dollars, quantities, or planned trades.",
  },
  {
    path: "/api/v1/performance",
    title: "Performance",
    description:
      "NAV and deployed-sleeve returns vs S&P 500 (SPY) and QQQ, plus unitized max drawdown. Percentages only.",
  },
  {
    path: "/api/v1/journal",
    title: "Journal",
    description:
      "Decision log: type, date, symbol, thesis, risks, invalidation, outcomes. No sizing dollars.",
  },
] as const;

export const HELD_RESOURCES = [
  {
    path: "/api/v1/planned",
    reason: "The deployment queue is not published.",
  },
  {
    path: "/api/v1/reviews",
    reason: "The review obligation queue is not published.",
  },
] as const;
