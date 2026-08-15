import { listPublicWatchlist, watchlistMarkdown } from "@/lib/api/v1/catalog";
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
    const names = await listPublicWatchlist();
    if (wantsMarkdown(request)) {
      return markdownResponse(watchlistMarkdown(names), {
        cacheControl: CACHE_CATALOG,
        remaining,
      });
    }
    return jsonResponse(
      { as_of: new Date().toISOString(), count: names.length, names },
      { cacheControl: CACHE_CATALOG, remaining },
    );
  });
}

export function OPTIONS() {
  return corsPreflight();
}
