import {
  PLANNED_ACTION_STATUSES,
  PLANNED_ACTION_TYPES,
  type PlannedActionStatus,
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
  updatePlannedAction,
} from "@/lib/planned-actions/mutate";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function asRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function PATCH(request: Request, context: RouteContext) {
  return handleAgentRequest(request, {
    scope: "powerfund:deployment:write",
    methods: ["PATCH"],
    operationId: "updatePlannedAction",
    handler: async (ctx) => {
      const { id } = await context.params;
      const body = await parseJsonBody(ctx.bodyText);
      assertNotTransactionMutation(body);
      if (!asRecord(body)) {
        throw validationError("Body must be a JSON object.");
      }
      const actionType =
        typeof body.action_type === "string" ? body.action_type : undefined;
      if (
        actionType != null &&
        !(PLANNED_ACTION_TYPES as readonly string[]).includes(actionType)
      ) {
        throw validationError("Invalid action_type.");
      }
      const status = typeof body.status === "string" ? body.status : undefined;
      if (
        status != null &&
        !(PLANNED_ACTION_STATUSES as readonly string[]).includes(status)
      ) {
        throw validationError("Invalid status.");
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
        : undefined;
      const updated = await updatePlannedAction(ctx.supabase, id, {
        action_type: actionType as PlannedActionType | undefined,
        planned_usd:
          typeof body.planned_usd === "number" ? body.planned_usd : undefined,
        target_weight_pct:
          typeof body.target_weight_pct === "number"
            ? body.target_weight_pct
            : undefined,
        window_label:
          typeof body.window_label === "string" ? body.window_label : undefined,
        due_by: typeof body.due_by === "string" ? body.due_by : undefined,
        rationale:
          typeof body.rationale === "string" ? body.rationale : undefined,
        trigger,
        status: status as PlannedActionStatus | undefined,
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
        { updated: true, planned_action: updated },
        { remaining: ctx.remaining },
      );
    },
  });
}

export function OPTIONS() {
  return agentCorsPreflight();
}
