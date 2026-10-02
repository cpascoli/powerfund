import { getRiskSnapshot } from "@/lib/agent/risk";
import { validationError } from "@/lib/api/agent/errors";
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
    operationId: "getRiskSnapshot",
    handler: async (ctx) => {
      const url = new URL(request.url);
      const universe = url.searchParams.get("universe") ?? "holdings";
      if (universe !== "holdings" && universe !== "all") {
        throw validationError("universe must be holdings or all.", { field: "universe" });
      }
      const rawMin = url.searchParams.get("min_abs_correlation");
      const min = rawMin == null ? undefined : Number(rawMin);
      if (min != null && !(min >= 0 && min <= 1)) {
        throw validationError("min_abs_correlation must be between 0 and 1.", {
          field: "min_abs_correlation",
        });
      }
      const body = await getRiskSnapshot(ctx.supabase, { universe, min_abs_correlation: min });
      return agentJson(body, { remaining: ctx.remaining });
    },
  });
}

export function OPTIONS() {
  return agentCorsPreflight();
}
