import { API_VERSION, HELD_RESOURCES, PUBLIC_RESOURCES } from "./resources";
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SECONDS } from "./rate-limit";

export function openApiDocument(origin: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Power Fund public catalog",
      version: API_VERSION,
      description:
        "Read-only research catalog for external agents. No authentication. " +
        "JSON by default; send Accept: text/markdown or ?format=md for markdown. " +
        `Rate limit: ${RATE_LIMIT_MAX} requests per ${RATE_LIMIT_WINDOW_SECONDS}s per IP. ` +
        "Does not include dollar amounts, quantities, or planned trades.",
    },
    servers: [{ url: origin }],
    paths: {
      "/api/v1": {
        get: {
          summary: "Catalog index",
          operationId: "getCatalogIndex",
          responses: { "200": { description: "Index of public resources" } },
        },
      },
      "/api/v1/openapi.json": {
        get: {
          summary: "OpenAPI document",
          operationId: "getOpenApi",
          responses: { "200": { description: "OpenAPI 3.1 document" } },
        },
      },
      "/api/v1/mandate": {
        get: {
          summary: "Mandate playbook",
          operationId: "getMandate",
          responses: { "200": { description: "Mandate as JSON or markdown" } },
        },
      },
      "/api/v1/goals": {
        get: {
          summary: "Goals playbook",
          operationId: "getGoals",
          responses: { "200": { description: "Goals as JSON or markdown" } },
        },
      },
      "/api/v1/themes": {
        get: {
          summary: "Themes taxonomy and playbook",
          operationId: "getThemes",
          responses: { "200": { description: "Themes as JSON or markdown" } },
        },
      },
      "/api/v1/watchlist": {
        get: {
          summary: "Research watchlist",
          operationId: "getWatchlist",
          responses: { "200": { description: "Watchlist names, no dollars" } },
        },
      },
      "/api/v1/companies/{symbol}": {
        get: {
          summary: "Company dossier",
          operationId: "getCompany",
          parameters: [
            {
              name: "symbol",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "Company research stub" },
            "404": { description: "Symbol is not on the public watchlist" },
          },
        },
      },
      "/api/v1/portfolio": {
        get: {
          summary: "Portfolio weights",
          operationId: "getPortfolio",
          responses: {
            "200": {
              description: "Open book as NAV weights. No dollars.",
            },
          },
        },
      },
      "/api/v1/journal": {
        get: {
          summary: "Decision journal",
          operationId: "getJournal",
          responses: {
            "200": {
              description: "Theses, invalidation, and outcomes. No dollars.",
            },
          },
        },
      },
    },
    "x-powerfund-public": PUBLIC_RESOURCES,
    "x-powerfund-held": HELD_RESOURCES,
  };
}
