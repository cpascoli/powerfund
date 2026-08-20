import {
  REVIEW_TASK_PRIORITIES,
  REVIEW_TASK_SCOPES,
  type ReviewTaskPriority,
  type ReviewTaskScope,
} from "@powerfund/domain";

import {
  agentCorsPreflight,
  agentJson,
  handleAgentRequest,
  parseJsonBody,
} from "@/lib/api/agent/http";
import { validationError } from "@/lib/api/agent/errors";
import {
  assertNotLedgerMutation,
  createReviewTask,
} from "@/lib/reviews/mutate";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value) || value.some((row) => typeof row !== "string")) {
    throw validationError("symbols and themes must be string arrays.");
  }
  return value;
}

export async function POST(request: Request) {
  return handleAgentRequest(request, {
    scope: "powerfund:reviews:write",
    methods: ["POST"],
    operationId: "createReviewTask",
    handler: async (ctx) => {
      const body = await parseJsonBody(ctx.bodyText);
      assertNotLedgerMutation(body);
      if (!asRecord(body)) {
        throw validationError("Body must be a JSON object.");
      }
      const scope = typeof body.scope === "string" ? body.scope : "";
      if (!(REVIEW_TASK_SCOPES as readonly string[]).includes(scope)) {
        throw validationError("Invalid scope.", { allowed: REVIEW_TASK_SCOPES });
      }
      const priority =
        typeof body.priority === "string" ? body.priority : undefined;
      if (
        priority != null &&
        !(REVIEW_TASK_PRIORITIES as readonly string[]).includes(priority)
      ) {
        throw validationError("Invalid priority.", {
          allowed: REVIEW_TASK_PRIORITIES,
        });
      }
      const created = await createReviewTask(ctx.supabase, {
        title: typeof body.title === "string" ? body.title : "",
        instructions:
          typeof body.instructions === "string" ? body.instructions : "",
        scope: scope as ReviewTaskScope,
        priority: priority as ReviewTaskPriority | undefined,
        symbols: stringList(body.symbols),
        themes: stringList(body.themes),
        trigger: body.trigger,
        created_by:
          typeof body.created_by === "string"
            ? body.created_by
            : ctx.principal.name,
      });
      return agentJson(
        { created: true, review_task: created },
        { remaining: ctx.remaining },
      );
    },
  });
}

export function OPTIONS() {
  return agentCorsPreflight();
}
