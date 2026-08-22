import {
  agentCorsPreflight,
  agentJson,
  handleAgentRequest,
} from "@/lib/api/agent/http";
import { AGENT_SCOPES } from "@/lib/api/agent/scopes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleAgentRequest(request, {
    scope: "powerfund:state:read",
    methods: ["GET"],
    operationId: "getAgentIndex",
    handler: async (ctx) => {
      const origin = new URL(request.url).origin;
      return agentJson(
        {
          name: "Power Fund agent API",
          as_of: new Date().toISOString(),
          description:
            "Authenticated domain operations for AI agents. Not table CRUD. Not trade execution.",
          scopes: AGENT_SCOPES,
          operations: [
            { operationId: "getFundState", method: "GET", path: "/api/v1/agent/state" },
            { operationId: "getPortfolio", method: "GET", path: "/api/v1/agent/portfolio" },
            {
              operationId: "getPerformance",
              method: "GET",
              path: "/api/v1/agent/performance",
            },
            { operationId: "getJournal", method: "GET", path: "/api/v1/agent/journal" },
            {
              operationId: "getPlannedActions",
              method: "GET",
              path: "/api/v1/agent/deployment-queue",
            },
            {
              operationId: "getReviewQueue",
              method: "GET",
              path: "/api/v1/agent/review-queue",
            },
            {
              operationId: "createReviewTask",
              method: "POST",
              path: "/api/v1/agent/review-tasks",
            },
            {
              operationId: "updateReviewTask",
              method: "PATCH",
              path: "/api/v1/agent/review-tasks/{id}",
            },
            {
              operationId: "completeReviewTask",
              method: "POST",
              path: "/api/v1/agent/review-tasks/{id}/complete",
            },
            {
              operationId: "getCompanyDossier",
              method: "GET",
              path: "/api/v1/agent/companies/{symbol}",
            },
            {
              operationId: "getDossierVersions",
              method: "GET",
              path: "/api/v1/agent/companies/{symbol}/versions",
            },
            {
              operationId: "getDossierVersion",
              method: "GET",
              path: "/api/v1/agent/companies/{symbol}/versions/{version}",
            },
            {
              operationId: "updateDossier",
              method: "PATCH",
              path: "/api/v1/agent/companies/{symbol}/dossier",
            },
            {
              operationId: "addWatchlistCompany",
              method: "POST",
              path: "/api/v1/agent/watchlist",
            },
            { operationId: "createDecision", method: "POST", path: "/api/v1/agent/decisions" },
            {
              operationId: "createPlannedAction",
              method: "POST",
              path: "/api/v1/agent/planned-actions",
            },
            {
              operationId: "updatePlannedAction",
              method: "PATCH",
              path: "/api/v1/agent/planned-actions/{id}",
            },
          ].map((row) => ({ ...row, url: `${origin}${row.path}` })),
          openapi: `${origin}/api/v1/agent/openapi.json`,
        },
        { remaining: ctx.remaining },
      );
    },
  });
}

export function OPTIONS() {
  return agentCorsPreflight();
}
