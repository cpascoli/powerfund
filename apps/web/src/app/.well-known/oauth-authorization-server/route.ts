import { authorizationServerMetadata } from "@/lib/oauth/metadata";
import { oauthJson, oauthPreflight, requestUrls } from "@/lib/oauth/http";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  try {
    return oauthJson(authorizationServerMetadata(requestUrls(request)));
  } catch {
    // No canonical origin: publishing a guessed issuer would be worse than none.
    return oauthJson({ error: "server_error", error_description: "Public origin is not configured." }, 503);
  }
}

export function OPTIONS() {
  return oauthPreflight();
}
