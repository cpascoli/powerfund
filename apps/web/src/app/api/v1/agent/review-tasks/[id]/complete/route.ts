import { REVIEW_OUTPUT_KINDS, type ReviewOutputKind } from "@powerfund/domain";

import {
  agentCorsPreflight,
  agentJson,
  handleAgentRequest,
  parseJsonBody,
} from "@/lib/api/agent/http";
import { validationError } from "@/lib/api/agent/errors";
import {
  assertNotLedgerMutation,
  completeReviewTask,
} from "@/lib/reviews/mutate";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function asRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request, context: RouteContext) {
  return handleAgentRequest(request, {
    scope: "powerfund:reviews:write",
    methods: ["POST"],
    operationId: "completeReviewTask",
    handler: async (ctx) => {
      const { id } = await context.params;
      const body = await parseJsonBody(ctx.bodyText);
      assertNotLedgerMutation(body);
      if (!asRecord(body)) {
        throw validationError("Body must be a JSON object.");
      }
      const rawOutputs = body.outputs;
      let outputs: Array<{ kind: ReviewOutputKind; entity_id: string }> | undefined;
      if (rawOutputs != null) {
        if (!Array.isArray(rawOutputs)) {
          throw validationError("outputs must be an array.");
        }
        outputs = rawOutputs.map((row) => {
          if (!asRecord(row)) {
            throw validationError("Each output must be an object.");
          }
          const kind = typeof row.kind === "string" ? row.kind : "";
          if (!(REVIEW_OUTPUT_KINDS as readonly string[]).includes(kind)) {
            throw validationError("Invalid output kind.", {
              allowed: REVIEW_OUTPUT_KINDS,
            });
          }
          const entityId =
            typeof row.entity_id === "string" ? row.entity_id : "";
          return { kind: kind as ReviewOutputKind, entity_id: entityId };
        });
      }
      const completed = await completeReviewTask(ctx.supabase, id, {
        outcome: typeof body.outcome === "string" ? body.outcome : "",
        outputs,
      });
      return agentJson(
        { completed: true, review_task: completed },
        { remaining: ctx.remaining },
      );
    },
  });
}

export function OPTIONS() {
  return agentCorsPreflight();
}
