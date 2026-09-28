import { clientKey, rateLimit } from "@/lib/api/v1/rate-limit";
import {
  oauthError,
  oauthJson,
  oauthPreflight,
  oauthStoreFromEnv,
  readFormParams,
  requestUrls,
} from "@/lib/oauth/http";
import { exchangeToken, OAuthTokenError } from "@/lib/oauth/token";

export const dynamic = "force-dynamic";

/** OAuth 2.1 token endpoint: authorization_code (with PKCE) and refresh_token. */
export async function POST(request: Request) {
  const limited = rateLimit(`oauth-token:${clientKey(request)}`);
  if (!limited.ok) {
    return oauthError("slow_down", "Too many token requests.", 429);
  }
  let params: URLSearchParams;
  try {
    params = await readFormParams(request);
  } catch {
    return oauthError("invalid_request", "Body must be application/x-www-form-urlencoded.");
  }
  try {
    const tokens = await exchangeToken(oauthStoreFromEnv(), requestUrls(request), params);
    return oauthJson(tokens);
  } catch (error) {
    if (error instanceof OAuthTokenError) {
      return oauthError(error.code, error.message, error.status);
    }
    console.error(JSON.stringify({ evt: "oauth.token.unexpected", error_name: error instanceof Error ? error.name : typeof error }));
    return oauthError("server_error", "Token endpoint failed.", 500);
  }
}

export function OPTIONS() {
  return oauthPreflight();
}
