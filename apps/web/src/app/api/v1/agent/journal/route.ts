import { getAgentJournal } from "@/lib/agent/journal";
import {
  agentCorsPreflight,
  agentJson,
  handleAgentRequest,
} from "@/lib/api/agent/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleAgentRequest(request, {
    scope: "powerfund:journal:read",
    methods: ["GET"],
    operationId: "getJournal",
    handler: async (ctx) => {
      const url = new URL(request.url);
      const body = await getAgentJournal(ctx.supabase, {
        symbol: url.searchParams.get("symbol") ?? undefined,
        decision_type: url.searchParams.get("decision_type") ?? undefined,
        date_from: url.searchParams.get("date_from") ?? undefined,
        date_to: url.searchParams.get("date_to") ?? undefined,
        limit: url.searchParams.get("limit")
          ? Number(url.searchParams.get("limit"))
          : undefined,
        before: url.searchParams.get("before") ?? undefined,
      });
      return agentJson(body, { remaining: ctx.remaining });
    },
  });
}

export function OPTIONS() {
  return agentCorsPreflight();
}
