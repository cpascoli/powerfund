import {
  agentCorsPreflight,
  agentJson,
  handleAgentRequest,
  parseJsonBody,
} from "@/lib/api/agent/http";
import { validationError } from "@/lib/api/agent/errors";
import {
  addWatchlistCompany,
  assertNotLedgerMutation,
} from "@/lib/watchlist/mutate";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  return handleAgentRequest(request, {
    scope: "powerfund:watchlist:write",
    methods: ["POST"],
    operationId: "addWatchlistCompany",
    handler: async (ctx) => {
      const body = await parseJsonBody(ctx.bodyText);
      assertNotLedgerMutation(body);
      if (!asRecord(body)) {
        throw validationError("Body must be a JSON object.");
      }
      const theme =
        typeof body.theme === "string"
          ? body.theme
          : typeof body.theme_slug === "string"
            ? body.theme_slug
            : "";
      const created = await addWatchlistCompany(ctx.supabase, {
        symbol: readString(body, "symbol"),
        name: readString(body, "name"),
        theme,
        notes: typeof body.notes === "string" ? body.notes : null,
        asset_class:
          typeof body.asset_class === "string" ? body.asset_class : null,
        exchange: typeof body.exchange === "string" ? body.exchange : null,
        actor_name:
          typeof body.actor_name === "string"
            ? body.actor_name
            : ctx.principal.name,
      });
      return agentJson(
        { created: true, company: created },
        { remaining: ctx.remaining },
      );
    },
  });
}

export function OPTIONS() {
  return agentCorsPreflight();
}
