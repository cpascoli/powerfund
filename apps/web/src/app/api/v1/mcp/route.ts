import { handleMcpRequest, mcpPreflight } from "@/lib/mcp/handler";
import { oauthStoreFromEnv } from "@/lib/oauth/http";

export const dynamic = "force-dynamic";

/**
 * PowerFund MCP server (Streamable HTTP, stateless). The agent-facing
 * interface over /api/v1/agent: see docs/mcp-architecture.md.
 */
function handle(request: Request): Promise<Response> {
  return handleMcpRequest(request, { store: oauthStoreFromEnv });
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;

export function OPTIONS() {
  return mcpPreflight();
}
