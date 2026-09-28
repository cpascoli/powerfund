import { clientKey, rateLimit } from "@/lib/api/v1/rate-limit";
import { oauthError, oauthPreflight, oauthStoreFromEnv, readFormParams } from "@/lib/oauth/http";
import { revokePresentedToken } from "@/lib/oauth/token";

export const dynamic = "force-dynamic";

/** RFC 7009. Revoking a refresh token revokes its whole grant. */
export async function POST(request: Request) {
  const limited = rateLimit(`oauth-revoke:${clientKey(request)}`);
  if (!limited.ok) {
    return oauthError("slow_down", "Too many revocation requests.", 429);
  }
  let params: URLSearchParams;
  try {
    params = await readFormParams(request);
  } catch {
    return oauthError("invalid_request", "Body must be application/x-www-form-urlencoded.");
  }
  const token = params.get("token");
  if (!token) {
    return oauthError("invalid_request", "token is required.");
  }
  try {
    await revokePresentedToken(oauthStoreFromEnv(), token);
  } catch {
    return oauthError("server_error", "Revocation failed.", 503);
  }
  return new Response(null, {
    status: 200,
    headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" },
  });
}

export function OPTIONS() {
  return oauthPreflight();
}
