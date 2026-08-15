import { companyMarkdown, getPublicCompany } from "@/lib/api/v1/catalog";
import {
  CACHE_CATALOG,
  corsPreflight,
  errorResponse,
  handlePublicGet,
  jsonResponse,
  markdownResponse,
  wantsMarkdown,
} from "@/lib/api/v1/http";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ symbol: string }> };

export async function GET(request: Request, context: RouteContext) {
  return handlePublicGet(request, CACHE_CATALOG, async (remaining) => {
    const { symbol } = await context.params;
    const company = await getPublicCompany(symbol);
    if (!company) {
      return errorResponse(
        404,
        `Unknown watchlist symbol: ${symbol.toUpperCase()}`,
        remaining,
      );
    }

    if (wantsMarkdown(request)) {
      return markdownResponse(companyMarkdown(company), {
        cacheControl: CACHE_CATALOG,
        remaining,
      });
    }

    return jsonResponse(
      { as_of: new Date().toISOString(), ...company },
      { cacheControl: CACHE_CATALOG, remaining },
    );
  });
}

export function OPTIONS() {
  return corsPreflight();
}
