import { journalMarkdown, listPublicJournal } from "@/lib/api/v1/book";
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
    const entries = await listPublicJournal();
    if (wantsMarkdown(request)) {
      return markdownResponse(journalMarkdown(entries), {
        cacheControl: CACHE_CATALOG,
        remaining,
      });
    }
    return jsonResponse(
      {
        as_of: new Date().toISOString(),
        count: entries.length,
        entries,
      },
      { cacheControl: CACHE_CATALOG, remaining },
    );
  });
}

export function OPTIONS() {
  return corsPreflight();
}
