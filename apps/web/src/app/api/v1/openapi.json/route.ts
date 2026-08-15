import { CACHE_INDEX, corsPreflight, handlePublicGet, jsonResponse } from "@/lib/api/v1/http";
import { openApiDocument } from "@/lib/api/v1/openapi";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handlePublicGet(request, CACHE_INDEX, async (remaining) => {
    const origin = new URL(request.url).origin;
    return jsonResponse(openApiDocument(origin), {
      cacheControl: CACHE_INDEX,
      remaining,
    });
  });
}

export function OPTIONS() {
  return corsPreflight();
}
