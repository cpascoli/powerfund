import {
  agentCorsPreflight,
  agentJson,
  handleAgentRequest,
  parseJsonBody,
} from "@/lib/api/agent/http";
import { validationError } from "@/lib/api/agent/errors";
import {
  assertNotLedgerMutation,
  setWatchlistArchived,
} from "@/lib/watchlist/mutate";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ symbol: string }> };

function asRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function PATCH(request: Request, context: RouteContext) {
  return handleAgentRequest(request, {
    scope: "powerfund:watchlist:write",
    methods: ["PATCH"],
    operationId: "setWatchlistArchived",
    handler: async (ctx) => {
      const { symbol } = await context.params;
      const body = await parseJsonBody(ctx.bodyText);
      assertNotLedgerMutation(body);
      if (!asRecord(body)) {
        throw validationError("Body must be a JSON object.");
      }
      if (typeof body.archived !== "boolean") {
        throw validationError(
          "archived must be true or false. `active` and `watchlist` follow the book and are not settable.",
          { field: "archived" },
        );
      }
      const result = await setWatchlistArchived(ctx.supabase, {
        symbol,
        archived: body.archived,
      });
      return agentJson(result, { remaining: ctx.remaining });
    },
  });
}

export function OPTIONS() {
  return agentCorsPreflight();
}
