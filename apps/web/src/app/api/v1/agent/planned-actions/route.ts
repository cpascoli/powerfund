import {
  PLANNED_ACTION_TYPES,
  type PlannedActionType,
} from "@powerfund/domain";

import {
  agentCorsPreflight,
  agentJson,
  handleAgentRequest,
  parseJsonBody,
} from "@/lib/api/agent/http";
import { validationError } from "@/lib/api/agent/errors";
import {
  assertNotTransactionMutation,
  createPlannedAction,
} from "@/lib/planned-actions/mutate";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  return handleAgentRequest(request, {
    scope: "powerfund:deployment:write",
    methods: ["POST"],
    operationId: "createPlannedAction",
    handler: async (ctx) => {
      const body = await parseJsonBody(ctx.bodyText);
      assertNotTransactionMutation(body);
      if (!asRecord(body)) {
        throw validationError("Body must be a JSON object.");
      }
      const actionType =
        typeof body.action_type === "string"
          ? body.action_type
          : typeof body.action === "string"
            ? body.action
            : "";
      if (!(PLANNED_ACTION_TYPES as readonly string[]).includes(actionType)) {
        throw validationError("Invalid action_type.", {
          allowed: PLANNED_ACTION_TYPES,
        });
      }
      const trigger = asRecord(body.trigger)
        ? {
            type: String(body.trigger.type ?? ""),
            value:
              typeof body.trigger.value === "number" ||
              typeof body.trigger.value === "string"
                ? body.trigger.value
                : null,
          }
        : null;
      const created = await createPlannedAction(ctx.supabase, {
        symbol: typeof body.symbol === "string" ? body.symbol : "",
        action_type: actionType as PlannedActionType,
        planned_usd:
          typeof body.planned_usd === "number" ? body.planned_usd : null,
        target_weight_pct:
          typeof body.target_weight_pct === "number"
            ? body.target_weight_pct
            : null,
        window_label:
          typeof body.window_label === "string" ? body.window_label : null,
        due_by: typeof body.due_by === "string" ? body.due_by : null,
        rationale:
          typeof body.rationale === "string"
            ? body.rationale
            : typeof body.reason === "string"
              ? body.reason
              : null,
        trigger,
        mandate_override_reason:
          typeof body.mandate_override_reason === "string"
            ? body.mandate_override_reason
            : null,
        actor_name:
          typeof body.actor_name === "string"
            ? body.actor_name
            : ctx.principal.name,
      });
      return agentJson(
        { created: true, planned_action: created },
        { remaining: ctx.remaining },
      );
    },
  });
}

export function OPTIONS() {
  return agentCorsPreflight();
}
