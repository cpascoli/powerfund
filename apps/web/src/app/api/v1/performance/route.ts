import {
  getPublicPerformance,
  performanceMarkdown,
} from "@/lib/api/v1/performance";
import {
  CACHE_CATALOG,
  corsPreflight,
  handlePublicGet,
  jsonResponse,
  markdownResponse,
  wantsMarkdown,
} from "@/lib/api/v1/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handlePublicGet(request, CACHE_CATALOG, async (remaining) => {
    const report = await getPublicPerformance();
    if (wantsMarkdown(request)) {
      return markdownResponse(performanceMarkdown(report), {
        cacheControl: CACHE_CATALOG,
        remaining,
      });
    }
    return jsonResponse(
      { as_of: new Date().toISOString(), ...report },
      { cacheControl: CACHE_CATALOG, remaining },
    );
  });
}

export function OPTIONS() {
  return corsPreflight();
}
