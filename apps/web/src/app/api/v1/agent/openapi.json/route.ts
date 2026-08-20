import {
  agentCorsPreflight,
  agentJson,
  handleAgentRequest,
} from "@/lib/api/agent/http";
import { agentOpenApiDocument } from "@/lib/api/agent/openapi";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleAgentRequest(request, {
    scope: "powerfund:state:read",
    methods: ["GET"],
    operationId: "getAgentOpenApi",
    handler: async (ctx) => {
      const origin = new URL(request.url).origin;
      return agentJson(agentOpenApiDocument(origin), {
        remaining: ctx.remaining,
      });
    },
  });
}

export function OPTIONS() {
  return agentCorsPreflight();
}
