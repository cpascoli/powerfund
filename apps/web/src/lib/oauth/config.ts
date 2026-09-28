import {
  AGENT_SCOPES,
  READ_SCOPES,
  WRITE_SCOPES,
  isAgentScope,
  type AgentScope,
} from "@/lib/api/agent/scopes";

/**
 * OAuth scopes are the agent API's scope strings, unchanged. agent-api.md
 * promised exactly this: a connector issues tokens carrying those scopes and
 * route handlers keep checking scopes, not which issuer minted the token.
 */
export const OAUTH_SCOPES = AGENT_SCOPES;
export const OAUTH_READ_SCOPES = READ_SCOPES;
export const OAUTH_WRITE_SCOPES = WRITE_SCOPES;

export const MCP_PATH = "/api/v1/mcp";

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
export const AUTHORIZATION_CODE_TTL_SECONDS = 120;
/** A cached client metadata document is refetched after this long. */
export const CLIENT_METADATA_MAX_AGE_SECONDS = 24 * 60 * 60;

export const TOKEN_PREFIX = {
  access: "pfat_",
  refresh: "pfrt_",
  code: "pfac_",
  client: "pfc_",
} as const;

/**
 * Hosts whose Client ID Metadata Documents we will fetch. CIMD lets any
 * HTTPS URL act as a client id, so without a list the authorization page
 * would fetch whatever URL it is handed. The list is short because the
 * operator connects a handful of known clients; anything else can use
 * dynamic registration and is labelled as self-registered on consent.
 */
export function clientMetadataHosts(
  raw = process.env.POWERFUND_OAUTH_CIMD_HOSTS,
): string[] {
  const value = raw?.trim() ? raw : "chatgpt.com,claude.ai,claude.com";
  return value
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The public origin this deployment answers on.
 *
 * Production should set POWERFUND_PUBLIC_ORIGIN so issuer and resource are
 * fixed strings. Deploy previews and local dev fall back to the request's own
 * Host, which is what lets a preview act as its own authorization server —
 * with tokens bound to the preview's resource URL, so they cannot be replayed
 * against production even though both read the same database.
 */
export function publicOrigin(
  headers: Headers,
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env.POWERFUND_PUBLIC_ORIGIN?.trim();
  if (configured) {
    return new URL(configured).origin;
  }
  const host = headers.get("host");
  if (!host) {
    throw new Error("Cannot determine the public origin: no Host header.");
  }
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
  const proto =
    headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (local ? "http" : "https");
  return new URL(`${proto}://${host}`).origin;
}

export type OAuthUrls = {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string;
  revocationEndpoint: string;
  /** Canonical MCP resource identifier (RFC 8707 / RFC 9728). */
  resource: string;
  resourceMetadata: string;
  authorizationServerMetadata: string;
};

export function oauthUrls(origin: string): OAuthUrls {
  return {
    issuer: origin,
    authorizationEndpoint: `${origin}/oauth/authorize`,
    tokenEndpoint: `${origin}/oauth/token`,
    registrationEndpoint: `${origin}/oauth/register`,
    revocationEndpoint: `${origin}/oauth/revoke`,
    resource: `${origin}${MCP_PATH}`,
    resourceMetadata: `${origin}/.well-known/oauth-protected-resource${MCP_PATH}`,
    authorizationServerMetadata: `${origin}/.well-known/oauth-authorization-server`,
  };
}

/** Same resource, ignoring a trailing slash and fragment. */
export function sameResource(left: string, right: string): boolean {
  const normalize = (value: string) => {
    try {
      const url = new URL(value);
      url.hash = "";
      return url.toString().replace(/\/$/, "");
    } catch {
      return value;
    }
  };
  return normalize(left) === normalize(right);
}

/**
 * Space-separated scope request → known scopes, de-duplicated, in catalog
 * order. Unknown scopes are dropped rather than refused: a client asking for
 * a scope we do not have should get what we can grant, and consent shows it.
 * An empty request means "everything this server offers".
 */
export function parseScopeRequest(raw: string | null | undefined): AgentScope[] {
  const requested = (raw ?? "").split(/\s+/).filter(Boolean);
  if (requested.length === 0) return [...OAUTH_SCOPES];
  const known = new Set(requested.filter(isAgentScope));
  return OAUTH_SCOPES.filter((scope) => known.has(scope));
}

export function isWriteScope(scope: AgentScope): boolean {
  return !(OAUTH_READ_SCOPES as readonly string[]).includes(scope);
}
