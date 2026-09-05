import {
  getResearchInbox,
  parseResearchInboxFilter,
} from "@/lib/agent/research";
import {
  agentCorsPreflight,
  agentJson,
  handleAgentRequest,
} from "@/lib/api/agent/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleAgentRequest(request, {
    scope: "powerfund:dossier:read",
    methods: ["GET"],
    operationId: "getResearchInbox",
    handler: async (ctx) => {
      const url = new URL(request.url);
      const body = await getResearchInbox(
        ctx.supabase,
        parseResearchInboxFilter(url.searchParams),
      );
      return agentJson(body, { remaining: ctx.remaining });
    },
  });
}

export function OPTIONS() {
  return agentCorsPreflight();
}
