import { loadPlaybook, playbookMarkdown } from "@/lib/api/v1/catalog";
import {
  CACHE_DOCS,
  corsPreflight,
  handlePublicGet,
  jsonResponse,
  markdownResponse,
  wantsMarkdown,
} from "@/lib/api/v1/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handlePublicGet(request, CACHE_DOCS, async (remaining) => {
    const doc = await loadPlaybook("mandate");
    if (wantsMarkdown(request)) {
      return markdownResponse(playbookMarkdown(doc), {
        cacheControl: CACHE_DOCS,
        remaining,
      });
    }
    return jsonResponse(
      { ...doc, as_of: new Date().toISOString() },
      { cacheControl: CACHE_DOCS, remaining },
    );
  });
}

export function OPTIONS() {
  return corsPreflight();
}
