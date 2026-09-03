import {
  agentCorsPreflight,
  agentJson,
  handleAgentRequest,
} from "@/lib/api/agent/http";
import { parseReviewQueueFilter } from "@/lib/reviews/filter";
import { getReviewQueue } from "@/lib/reviews/queue";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleAgentRequest(request, {
    scope: "powerfund:reviews:read",
    methods: ["GET"],
    operationId: "getReviewQueue",
    handler: async (ctx) => {
      const url = new URL(request.url);
      const body = await getReviewQueue(
        ctx.supabase,
        parseReviewQueueFilter(url.searchParams),
      );
      return agentJson(body, { remaining: ctx.remaining });
    },
  });
}

export function OPTIONS() {
  return agentCorsPreflight();
}
