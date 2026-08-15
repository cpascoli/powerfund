import {
  getPublicPortfolio,
  portfolioMarkdown,
} from "@/lib/api/v1/book";
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
    const book = await getPublicPortfolio();
    if (wantsMarkdown(request)) {
      return markdownResponse(portfolioMarkdown(book), {
        cacheControl: CACHE_CATALOG,
        remaining,
      });
    }
    return jsonResponse(
      { as_of: new Date().toISOString(), ...book },
      { cacheControl: CACHE_CATALOG, remaining },
    );
  });
}

export function OPTIONS() {
  return corsPreflight();
}
