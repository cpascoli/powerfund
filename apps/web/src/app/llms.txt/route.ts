import { CACHE_INDEX, corsPreflight, handlePublicGet, markdownResponse } from "@/lib/api/v1/http";
import { HELD_RESOURCES, PUBLIC_RESOURCES } from "@/lib/api/v1/resources";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handlePublicGet(request, CACHE_INDEX, async (remaining) => {
    const origin = new URL(request.url).origin;
    const lines = [
      "# Power Fund",
      "",
      "> Read-only research catalog for AI agents. No authentication.",
      "> Does not include portfolio dollars, planned trades, or the decision journal.",
      "",
      "## Docs",
      "",
      ...PUBLIC_RESOURCES.map(
        (row) => `- [${row.title}](${origin}${row.path}): ${row.description}`,
      ),
      "",
      "## Not published yet",
      "",
      ...HELD_RESOURCES.map((row) => `- ${row.path}: ${row.reason}`),
      "",
      `Optional: append ?format=md or send Accept: text/markdown.`,
      "",
    ];
    return markdownResponse(lines.join("\n"), {
      cacheControl: CACHE_INDEX,
      remaining,
    });
  });
}

export function OPTIONS() {
  return corsPreflight();
}
