import { listDossierVersions } from "@/lib/agent/companies";
import {
  agentCorsPreflight,
  agentJson,
  handleAgentRequest,
} from "@/lib/api/agent/http";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ symbol: string }> };

export async function GET(request: Request, context: RouteContext) {
  return handleAgentRequest(request, {
    scope: "powerfund:dossier:read",
    methods: ["GET"],
    operationId: "getDossierVersions",
    handler: async (ctx) => {
      const { symbol } = await context.params;
      const body = await listDossierVersions(ctx.supabase, symbol);
      return agentJson(body, { remaining: ctx.remaining });
    },
  });
}

export function OPTIONS() {
  return agentCorsPreflight();
}
