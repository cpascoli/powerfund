import { authenticateAgent, type AgentPrincipal } from "@/lib/api/agent/auth";
import { AgentApiError } from "@/lib/api/agent/errors";
import { OAUTH_SCOPES, TOKEN_PREFIX, type OAuthUrls } from "@/lib/oauth/config";
import type { OAuthStore } from "@/lib/oauth/store";
import { verifyAccessToken } from "@/lib/oauth/token";

export type McpAuthResult =
  | { ok: true; principal: AgentPrincipal; method: "oauth" | "agent_key"; token: string; clientId: string; expiresAt?: number }
  | { ok: false; error: "missing_token" | "invalid_token"; description: string };

/**
 * Who is calling the MCP endpoint.
 *
 * Two credentials are accepted, and both resolve to the principal-with-scopes
 * the agent API already understands:
 *
 * - An OAuth access token from PowerFund's authorization server. This is what
 *   ChatGPT uses; it cannot send static keys.
 * - A static agent key from POWERFUND_AGENT_API_KEYS, the same secret that
 *   already grants the REST API. It adds no new access — anything it can do
 *   here it can do over REST — and it is how MCP Inspector, CLI clients and
 *   CI reach the server without an interactive login.
 *
 * The prefix decides which check runs, so an agent key is never sent to the
 * database and a token lookup never compares against key secrets.
 */
export async function authenticateMcpRequest(
  request: Request,
  deps: { store: () => OAuthStore; urls: OAuthUrls; now?: Date; agentKeys?: string },
): Promise<McpAuthResult> {
  const header = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(\S+)\s*$/i.exec(header)?.[1];
  if (!token) {
    return { ok: false, error: "missing_token", description: "Authorization required." };
  }

  if (token.startsWith(TOKEN_PREFIX.access)) {
    const checked = await verifyAccessToken(deps.store(), deps.urls, token, deps.now);
    if (!checked.ok) {
      return {
        ok: false,
        error: "invalid_token",
        description:
          checked.reason === "expired"
            ? "The access token has expired."
            : "The access token is not valid for this server.",
      };
    }
    return {
      ok: true,
      principal: checked.principal,
      method: "oauth",
      token,
      clientId: checked.token.client_id,
      expiresAt: Math.floor(Date.parse(checked.token.expires_at) / 1000),
    };
  }

  try {
    const principal = authenticateAgent(
      new Request(request.url, { headers: { authorization: `Bearer ${token}` } }),
      deps.agentKeys ?? process.env.POWERFUND_AGENT_API_KEYS,
    );
    return { ok: true, principal, method: "agent_key", token, clientId: `agent-key:${principal.name}` };
  } catch (error) {
    if (error instanceof AgentApiError && error.status === 401) {
      return { ok: false, error: "invalid_token", description: "The bearer token is not recognised." };
    }
    throw error;
  }
}

/**
 * RFC 6750 / RFC 9728 challenge. `resource_metadata` is how an MCP client
 * discovers where to authorize; without it ChatGPT cannot start OAuth.
 */
export function wwwAuthenticate(
  urls: OAuthUrls,
  failure?: { error: string; description: string },
): string {
  const parts = [
    `resource_metadata="${urls.resourceMetadata}"`,
    `scope="${OAUTH_SCOPES.join(" ")}"`,
  ];
  if (failure && failure.error !== "missing_token") {
    parts.push(`error="${failure.error}"`, `error_description="${failure.description}"`);
  }
  return `Bearer ${parts.join(", ")}`;
}
