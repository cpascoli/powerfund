import { authorizationServerMetadata } from "@/lib/oauth/metadata";
import { oauthJson, oauthPreflight, requestUrls } from "@/lib/oauth/http";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return oauthJson(authorizationServerMetadata(requestUrls(request)));
}

export function OPTIONS() {
  return oauthPreflight();
}
