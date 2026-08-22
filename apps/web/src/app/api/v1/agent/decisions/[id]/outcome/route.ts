import {
  agentCorsPreflight,
  agentJson,
  handleAgentRequest,
  parseJsonBody,
} from "@/lib/api/agent/http";
import { validationError } from "@/lib/api/agent/errors";
import {
  assertNotDecisionPatch,
  recordDecisionOutcome,
} from "@/lib/journal/record-outcome";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function asRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request, context: RouteContext) {
  return handleAgentRequest(request, {
    scope: "powerfund:journal:append",
    methods: ["POST"],
    operationId: "recordDecisionOutcome",
    handler: async (ctx) => {
      const { id } = await context.params;
      const body = await parseJsonBody(ctx.bodyText);
      assertNotDecisionPatch(body);
      if (!asRecord(body)) {
        throw validationError("Body must be a JSON object.");
      }
      const outcome = await recordDecisionOutcome(ctx.supabase, id, {
        thesis_grade:
          typeof body.thesis_grade === "string" ? body.thesis_grade : "",
        timing_grade:
          typeof body.timing_grade === "string" ? body.timing_grade : null,
        sizing_grade:
          typeof body.sizing_grade === "string" ? body.sizing_grade : null,
        risk_management_grade:
          typeof body.risk_management_grade === "string"
            ? body.risk_management_grade
            : null,
        lessons: typeof body.lessons === "string" ? body.lessons : "",
        actor_name:
          typeof body.actor_name === "string"
            ? body.actor_name
            : ctx.principal.name,
      });
      return agentJson(
        { recorded: true, outcome },
        { remaining: ctx.remaining },
      );
    },
  });
}

export function OPTIONS() {
  return agentCorsPreflight();
}
