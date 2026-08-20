import { getPrivatePortfolio } from "@/lib/agent/portfolio";
import {
  agentCorsPreflight,
  agentJson,
  handleAgentRequest,
} from "@/lib/api/agent/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleAgentRequest(request, {
    scope: "powerfund:portfolio:read",
    methods: ["GET"],
    operationId: "getPortfolio",
    handler: async (ctx) => {
      const body = await getPrivatePortfolio(ctx.supabase);
      return agentJson(body, { remaining: ctx.remaining });
    },
  });
}

export function OPTIONS() {
  return agentCorsPreflight();
}
