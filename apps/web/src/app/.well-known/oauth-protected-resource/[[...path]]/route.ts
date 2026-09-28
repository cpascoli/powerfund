import { protectedResourceMetadata } from "@/lib/oauth/metadata";
import { oauthJson, oauthPreflight, requestUrls } from "@/lib/oauth/http";

export const dynamic = "force-dynamic";

/**
 * RFC 9728. Served at the path-inserted location for the MCP endpoint
 * (/.well-known/oauth-protected-resource/api/v1/mcp), which is what the MCP
 * spec tells clients to try first, and at the bare root as the fallback.
 * There is only one protected resource, so both return the same document.
 */
export function GET(request: Request) {
  return oauthJson(protectedResourceMetadata(requestUrls(request)));
}

export function OPTIONS() {
  return oauthPreflight();
}
