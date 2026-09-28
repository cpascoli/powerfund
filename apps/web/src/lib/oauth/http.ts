import { createAdminClient } from "@/lib/supabase/admin";

import { oauthUrls, publicOrigin, type OAuthUrls } from "./config";
import { supabaseOAuthStore, type OAuthStore } from "./store";

/**
 * The machine-facing OAuth endpoints are called cross-origin by browser-based
 * clients (MCP Inspector) as well as server-to-server by ChatGPT. None of them
 * uses cookies, so a wildcard origin grants nothing a direct request would not.
 */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Protocol-Version",
};

export function oauthJson(body: unknown, status = 200, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      ...CORS_HEADERS,
      ...extra,
    },
  });
}

export function oauthError(error: string, description: string, status = 400): Response {
  return oauthJson({ error, error_description: description }, status);
}

export function oauthPreflight(): Response {
  return new Response(null, { status: 204, headers: { ...CORS_HEADERS, "Access-Control-Max-Age": "600" } });
}

export function requestUrls(request: Request): OAuthUrls {
  return oauthUrls(publicOrigin(request.headers));
}

export function oauthStoreFromEnv(): OAuthStore {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error("Supabase is not configured on the server.");
  }
  return supabaseOAuthStore(admin);
}

const MAX_FORM_BYTES = 16 * 1024;

/** Token and revocation requests are form-encoded; accept JSON too. */
export async function readFormParams(request: Request): Promise<URLSearchParams> {
  const text = await request.text();
  if (text.length > MAX_FORM_BYTES) {
    throw new Error("Request body too large.");
  }
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(parsed ?? {})) {
      if (typeof value === "string") params.set(key, value);
    }
    return params;
  }
  return new URLSearchParams(text);
}
