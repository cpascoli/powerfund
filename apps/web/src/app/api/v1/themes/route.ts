import { listPublicThemes, loadPlaybook, themesMarkdown } from "@/lib/api/v1/catalog";
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
    const [playbook, themes] = await Promise.all([
      loadPlaybook("themes"),
      listPublicThemes(),
    ]);

    if (wantsMarkdown(request)) {
      return markdownResponse(themesMarkdown(playbook, themes), {
        cacheControl: CACHE_DOCS,
        remaining,
      });
    }

    return jsonResponse(
      {
        as_of: new Date().toISOString(),
        themes,
        playbook,
      },
      { cacheControl: CACHE_DOCS, remaining },
    );
  });
}

export function OPTIONS() {
  return corsPreflight();
}
