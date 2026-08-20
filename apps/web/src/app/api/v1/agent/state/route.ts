import { getFundState } from "@/lib/agent/state";
import {
  agentCorsPreflight,
  agentJson,
  handleAgentRequest,
} from "@/lib/api/agent/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleAgentRequest(request, {
    scope: "powerfund:state:read",
    methods: ["GET"],
    operationId: "getFundState",
    handler: async (ctx) => {
      const url = new URL(request.url);
      const recent = url.searchParams.get("recent_decisions");
      const watchlist = url.searchParams.get("include_watchlist");
      const body = await getFundState(ctx.supabase, {
        recent_decisions: recent ? Number(recent) : undefined,
        include_watchlist:
          watchlist == null ? undefined : watchlist !== "false" && watchlist !== "0",
      });
      return agentJson(body, { remaining: ctx.remaining });
    },
  });
}

export function OPTIONS() {
  return agentCorsPreflight();
}
