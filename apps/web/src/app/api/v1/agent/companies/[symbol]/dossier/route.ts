import { parseJsonBody, agentCorsPreflight, agentJson, handleAgentRequest } from "@/lib/api/agent/http";
import { parseDossierPatch, saveDossierVersioned } from "@/lib/dossiers/save";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ symbol: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  return handleAgentRequest(request, {
    scope: "powerfund:dossier:write",
    methods: ["PATCH"],
    operationId: "updateDossier",
    handler: async (ctx) => {
      const { symbol } = await context.params;
      const body = await parseJsonBody(ctx.bodyText);
      const input = parseDossierPatch(symbol, body, ctx.principal.name);
      const result = await saveDossierVersioned(ctx.supabase, input);
      return agentJson(result, { remaining: ctx.remaining });
    },
  });
}

export function OPTIONS() {
  return agentCorsPreflight();
}
