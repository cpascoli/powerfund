import { getCalibrationStatus } from "@/lib/agent/calibration";
import {
  agentCorsPreflight,
  agentJson,
  handleAgentRequest,
} from "@/lib/api/agent/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleAgentRequest(request, {
    scope: "powerfund:journal:read",
    methods: ["GET"],
    operationId: "getCalibrationStatus",
    handler: async (ctx) => {
      const body = await getCalibrationStatus(ctx.supabase);
      return agentJson(body, { remaining: ctx.remaining });
    },
  });
}

export function OPTIONS() {
  return agentCorsPreflight();
}
