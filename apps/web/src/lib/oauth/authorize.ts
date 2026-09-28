import type { AgentScope } from "@/lib/api/agent/scopes";

import { OAuthClientError, resolveClient, type FetchLike } from "./clients";
import {
  AUTHORIZATION_CODE_TTL_SECONDS,
  OAUTH_READ_SCOPES,
  parseScopeRequest,
  sameResource,
  TOKEN_PREFIX,
  type OAuthUrls,
} from "./config";
import { hashSecret, isPkceChallenge, randomToken } from "./crypto";
import type { ClientRecord, OAuthStore } from "./store";

export type AuthorizationRequest = {
  client: ClientRecord;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  scopes: AgentScope[];
  resource: string;
};

/**
 * Two kinds of failure, and the difference is the security property.
 *
 * `fatal`: the client or redirect URI cannot be trusted, so we must not
 * redirect anywhere — that would make this page an open redirector that
 * forwards error detail (and in the worst case a code) to an attacker. We
 * render an error instead.
 *
 * `redirect`: the client and URI are verified, so the error goes back to the
 * client the standard way (RFC 6749 §4.1.2.1).
 */
export type AuthorizationValidation =
  | { ok: true; request: AuthorizationRequest }
  | { ok: false; kind: "fatal"; message: string }
  | { ok: false; kind: "redirect"; location: string };

export type AuthorizeParams = Record<string, string | undefined>;

export function authorizationRedirect(
  redirectUri: string,
  params: Record<string, string | null | undefined>,
): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value != null) url.searchParams.set(key, value);
  }
  return url.toString();
}

export async function validateAuthorizationRequest(
  store: OAuthStore,
  urls: OAuthUrls,
  params: AuthorizeParams,
  args: { fetch?: FetchLike; hosts?: string[]; now?: Date } = {},
): Promise<AuthorizationValidation> {
  const clientId = params.client_id ?? "";
  const redirectUri = params.redirect_uri ?? "";
  if (!clientId) {
    return { ok: false, kind: "fatal", message: "The request has no client_id." };
  }

  let client: ClientRecord;
  try {
    client = await resolveClient(store, clientId, args);
  } catch (error) {
    return {
      ok: false,
      kind: "fatal",
      message: error instanceof OAuthClientError ? error.message : "The client could not be verified.",
    };
  }

  // Exact string match against what the client registered: no prefix or
  // wildcard matching, which is how redirect-based code theft usually works.
  if (!redirectUri || !client.redirect_uris.includes(redirectUri)) {
    return {
      ok: false,
      kind: "fatal",
      message: "The redirect_uri is not registered for this client.",
    };
  }

  const state = params.state ?? null;
  const back = (error: string, description: string): AuthorizationValidation => ({
    ok: false,
    kind: "redirect",
    location: authorizationRedirect(redirectUri, {
      error,
      error_description: description,
      state,
      iss: urls.issuer,
    }),
  });

  if (params.response_type !== "code") {
    return back("unsupported_response_type", "Only response_type=code is supported.");
  }
  const challenge = params.code_challenge ?? "";
  if (params.code_challenge_method !== "S256" || !isPkceChallenge(challenge)) {
    return back("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  }
  // MCP clients send the resource they want a token for. Absent means this
  // server's MCP resource, the only one we issue for; anything else is not us.
  const resource = params.resource || urls.resource;
  if (!sameResource(resource, urls.resource)) {
    return back("invalid_target", "This server only issues tokens for its own MCP resource.");
  }
  const scopes = parseScopeRequest(params.scope);
  if (scopes.length === 0) {
    return back("invalid_scope", "None of the requested scopes are offered by PowerFund.");
  }

  return {
    ok: true,
    request: {
      client,
      redirectUri,
      state,
      codeChallenge: challenge,
      scopes,
      resource: urls.resource,
    },
  };
}

export type ConsentChoice = "read_write" | "read_only";

/**
 * The scopes the operator actually grants: the request, narrowed to reads
 * when they chose read-only. Consent can only ever narrow a request.
 */
export function grantedScopes(requested: AgentScope[], choice: ConsentChoice): AgentScope[] {
  if (choice === "read_write") return requested;
  return requested.filter((scope) => (OAUTH_READ_SCOPES as readonly string[]).includes(scope));
}

export async function issueAuthorizationCode(
  store: OAuthStore,
  urls: OAuthUrls,
  request: AuthorizationRequest,
  args: { userId: string; scopes: AgentScope[]; now?: Date },
): Promise<string> {
  const now = args.now ?? new Date();
  if (args.scopes.length === 0) {
    return authorizationRedirect(request.redirectUri, {
      error: "invalid_scope",
      error_description: "No scopes were granted.",
      state: request.state,
      iss: urls.issuer,
    });
  }
  const code = randomToken(TOKEN_PREFIX.code);
  await store.insertCode({
    code_hash: hashSecret(code),
    client_id: request.client.client_id,
    user_id: args.userId,
    redirect_uri: request.redirectUri,
    code_challenge: request.codeChallenge,
    scopes: args.scopes,
    resource: request.resource,
    expires_at: new Date(now.getTime() + AUTHORIZATION_CODE_TTL_SECONDS * 1000).toISOString(),
    used_at: null,
  });
  // `iss` on every response (RFC 9207): ChatGPT uses the issuer-identified
  // redirect only when the server promises it, and it closes mix-up attacks.
  return authorizationRedirect(request.redirectUri, {
    code,
    state: request.state,
    iss: urls.issuer,
  });
}

export function deniedRedirect(urls: OAuthUrls, request: AuthorizationRequest): string {
  return authorizationRedirect(request.redirectUri, {
    error: "access_denied",
    error_description: "The operator declined the connection.",
    state: request.state,
    iss: urls.issuer,
  });
}
