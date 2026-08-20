import {
  agentCorsPreflight,
  agentJson,
  handleAgentRequest,
  parseJsonBody,
} from "@/lib/api/agent/http";
import { validationError } from "@/lib/api/agent/errors";
import { DECISION_TYPES, type DecisionType } from "@powerfund/domain";
import { createDecision } from "@/lib/journal/create-decision";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  return handleAgentRequest(request, {
    scope: "powerfund:journal:append",
    methods: ["POST"],
    operationId: "createDecision",
    handler: async (ctx) => {
      const body = await parseJsonBody(ctx.bodyText);
      if (!asRecord(body)) {
        throw validationError("Body must be a JSON object.");
      }
      if ("dossier_version_id" in body) {
        throw validationError(
          "Do not supply dossier_version_id. The current dossier version is pinned automatically.",
        );
      }
      const symbol = typeof body.symbol === "string" ? body.symbol : "";
      const decisionType =
        typeof body.decision_type === "string" ? body.decision_type : "";
      if (!(DECISION_TYPES as readonly string[]).includes(decisionType)) {
        throw validationError("Invalid decision_type.", { allowed: DECISION_TYPES });
      }
      const created = await createDecision(ctx.supabase, {
        symbol,
        decision_type: decisionType as DecisionType,
        thesis: typeof body.thesis === "string" ? body.thesis : "",
        catalysts: typeof body.catalysts === "string" ? body.catalysts : null,
        risks: typeof body.risks === "string" ? body.risks : null,
        invalidation:
          typeof body.invalidation === "string" ? body.invalidation : null,
        sizing_rationale:
          typeof body.sizing_rationale === "string" ? body.sizing_rationale : null,
        action_at: typeof body.action_at === "string" ? body.action_at : null,
        actor_name:
          typeof body.actor_name === "string"
            ? body.actor_name
            : ctx.principal.name,
      });
      return agentJson(
        { created: true, decision: created },
        { remaining: ctx.remaining },
      );
    },
  });
}

export function OPTIONS() {
  return agentCorsPreflight();
}
