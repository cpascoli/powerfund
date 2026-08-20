import { getDossierVersion } from "@/lib/agent/companies";
import {
  agentCorsPreflight,
  agentJson,
  handleAgentRequest,
} from "@/lib/api/agent/http";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ symbol: string; version: string }> };

export async function GET(request: Request, context: RouteContext) {
  return handleAgentRequest(request, {
    scope: "powerfund:dossier:read",
    methods: ["GET"],
    operationId: "getDossierVersion",
    handler: async (ctx) => {
      const { symbol, version } = await context.params;
      const body = await getDossierVersion(ctx.supabase, symbol, version);
      return agentJson(body, { remaining: ctx.remaining });
    },
  });
}

export function OPTIONS() {
  return agentCorsPreflight();
}
