import { getDeploymentQueue } from "@/lib/agent/queue";
import {
  agentCorsPreflight,
  agentJson,
  handleAgentRequest,
} from "@/lib/api/agent/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleAgentRequest(request, {
    scope: "powerfund:deployment:read",
    methods: ["GET"],
    operationId: "getPlannedActions",
    handler: async (ctx) => {
      const body = await getDeploymentQueue(ctx.supabase);
      return agentJson(body, { remaining: ctx.remaining });
    },
  });
}

export function OPTIONS() {
  return agentCorsPreflight();
}
