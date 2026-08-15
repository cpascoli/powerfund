import {
  CACHE_INDEX,
  corsPreflight,
  handlePublicGet,
  jsonResponse,
  markdownResponse,
  wantsMarkdown,
} from "@/lib/api/v1/http";
import { API_VERSION, HELD_RESOURCES, PUBLIC_RESOURCES } from "@/lib/api/v1/resources";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handlePublicGet(request, CACHE_INDEX, async (remaining) => {
    const origin = new URL(request.url).origin;
    const body = {
      name: "Power Fund public catalog",
      version: API_VERSION,
      as_of: new Date().toISOString(),
      description:
        "Read-only research catalog. No auth. No dollars, quantities, or planned trades.",
      formats: ["application/json", "text/markdown"],
      rate_limit: "60 requests per 60 seconds per IP",
      resources: PUBLIC_RESOURCES.map((row) => ({
        ...row,
        url: `${origin}${row.path}`,
      })),
      held: HELD_RESOURCES,
      openapi: `${origin}/api/v1/openapi.json`,
      llms_txt: `${origin}/llms.txt`,
    };

    if (wantsMarkdown(request)) {
      const lines = [
        "# Power Fund public catalog",
        "",
        body.description,
        "",
        "## Resources",
        "",
        ...body.resources.map(
          (row) => `- [${row.title}](${row.url}) — ${row.description}`,
        ),
        "",
        "## Not published yet",
        "",
        ...body.held.map((row) => `- \`${row.path}\` — ${row.reason}`),
        "",
        `- OpenAPI: ${body.openapi}`,
        `- llms.txt: ${body.llms_txt}`,
        "",
      ];
      return markdownResponse(lines.join("\n"), {
        cacheControl: CACHE_INDEX,
        remaining,
      });
    }

    return jsonResponse(body, { cacheControl: CACHE_INDEX, remaining });
  });
}

export function OPTIONS() {
  return corsPreflight();
}
