import {
  agentCorsPreflight,
  agentJson,
  handleAgentRequest,
} from "@/lib/api/agent/http";
import { agentOperations } from "@/lib/api/agent/openapi";
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
          operations: agentOperations(origin),
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
