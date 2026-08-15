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
      "Published research stub for a watchlist name. Omits invalidation levels.",
  },
] as const;

export const HELD_RESOURCES = [
  {
    path: "/api/v1/portfolio",
    reason: "Live book, cash, and weights stay private for now.",
  },
  {
    path: "/api/v1/journal",
    reason: "Decision journal and kill levels stay private for now.",
  },
] as const;
