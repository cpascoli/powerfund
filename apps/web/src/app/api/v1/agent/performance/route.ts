import {
  getAgentPerformance,
  parsePerformanceRange,
} from "@/lib/agent/performance";
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
    operationId: "getPerformance",
    handler: async (ctx) => {
      const range = parsePerformanceRange(new URL(request.url));
      const body = await getAgentPerformance(ctx.supabase, range);
      return agentJson(body, { remaining: ctx.remaining });
    },
  });
}

export function OPTIONS() {
  return agentCorsPreflight();
}
