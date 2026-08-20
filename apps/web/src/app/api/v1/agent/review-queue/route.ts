import {
  agentCorsPreflight,
  agentJson,
  handleAgentRequest,
} from "@/lib/api/agent/http";
import { getReviewQueue } from "@/lib/reviews/queue";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleAgentRequest(request, {
    scope: "powerfund:reviews:read",
    methods: ["GET"],
    operationId: "getReviewQueue",
    handler: async (ctx) => {
      const url = new URL(request.url);
      const evaluate = url.searchParams.get("evaluate");
      const body = await getReviewQueue(ctx.supabase, {
        status: url.searchParams.get("status"),
        evaluate:
          evaluate == null
            ? undefined
            : evaluate !== "false" && evaluate !== "0",
      });
      return agentJson(body, { remaining: ctx.remaining });
    },
  });
}

export function OPTIONS() {
  return agentCorsPreflight();
}
