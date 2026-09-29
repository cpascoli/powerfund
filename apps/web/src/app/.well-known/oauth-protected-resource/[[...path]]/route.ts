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
  try {
    return oauthJson(protectedResourceMetadata(requestUrls(request)));
  } catch {
    // No canonical origin: publishing a guessed issuer would be worse than none.
    return oauthJson({ error: "server_error", error_description: "Public origin is not configured." }, 503);
  }
}

export function OPTIONS() {
  return oauthPreflight();
}
