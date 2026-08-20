import {
  corsPreflight,
  handlePublicGet,
  jsonResponse,
} from "@/lib/api/v1/http";
import { agentOpenApiDocument } from "@/lib/api/agent/openapi";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handlePublicGet(request, "no-store", async (remaining) => {
    const origin = new URL(request.url).origin;
    return jsonResponse(agentOpenApiDocument(origin), {
      cacheControl: "no-store",
      remaining,
    });
  });
}

export function OPTIONS() {
  return corsPreflight();
}
