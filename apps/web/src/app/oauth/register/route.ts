import { clientKey, rateLimit } from "@/lib/api/v1/rate-limit";
import { OAuthClientError, registerDynamicClient } from "@/lib/oauth/clients";
import { oauthError, oauthJson, oauthPreflight, oauthStoreFromEnv } from "@/lib/oauth/http";

export const dynamic = "force-dynamic";

/**
 * RFC 7591 dynamic client registration, for MCP clients that do not publish a
 * Client ID Metadata Document on an allowed host (MCP Inspector, CLIs).
 * Registering grants nothing: the operator still has to approve the client on
 * the consent page, which labels it as self-registered.
 */
export async function POST(request: Request) {
  const limited = rateLimit(`oauth-register:${clientKey(request)}`);
  if (!limited.ok) {
    return oauthError("slow_down", "Too many registrations.", 429);
  }
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 16 * 1024) throw new Error("too large");
    body = JSON.parse(text);
  } catch {
    return oauthError("invalid_client_metadata", "Body must be a JSON object.");
  }
  try {
    const client = await registerDynamicClient(oauthStoreFromEnv(), body);
    return oauthJson(
      {
        client_id: client.client_id,
        client_id_issued_at: Math.floor(Date.parse(client.refreshed_at) / 1000),
        client_name: client.client_name ?? undefined,
        redirect_uris: client.redirect_uris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      201,
    );
  } catch (error) {
    if (error instanceof OAuthClientError) {
      return oauthError(error.code, error.message);
    }
    console.error(JSON.stringify({ evt: "oauth.register.unexpected", error_name: error instanceof Error ? error.name : typeof error }));
    return oauthError("server_error", "Registration failed.", 500);
  }
}

export function OPTIONS() {
  return oauthPreflight();
}
