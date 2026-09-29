import { createHash, randomUUID } from "node:crypto";

import { isAgentScope, type AgentScope } from "@/lib/api/agent/scopes";
import type { AgentPrincipal } from "@/lib/api/agent/auth";

import { principalNameFor } from "./clients";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  sameResource,
  TOKEN_PREFIX,
  type OAuthUrls,
} from "./config";
import { hashSecret, randomToken, verifyPkceS256 } from "./crypto";
import type { OAuthStore, TokenRecord } from "./store";

export class OAuthTokenError extends Error {
  constructor(
    readonly code:
      | "invalid_request"
      | "invalid_grant"
      | "invalid_client"
      | "unsupported_grant_type"
      | "invalid_scope"
      | "invalid_target",
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "OAuthTokenError";
  }
}

export type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
};

async function issuePair(
  store: OAuthStore,
  args: {
    clientId: string;
    userId: string;
    principalName: string;
    scopes: string[];
    resource: string;
    familyId: string;
    codeHash: string | null;
    now: Date;
  },
): Promise<TokenResponse> {
  const access = randomToken(TOKEN_PREFIX.access);
  const refresh = randomToken(TOKEN_PREFIX.refresh);
  const base = {
    client_id: args.clientId,
    user_id: args.userId,
    principal_name: args.principalName,
    scopes: args.scopes,
    resource: args.resource,
    family_id: args.familyId,
    code_hash: args.codeHash,
  };
  const at = args.now.getTime();
  await store.insertTokens([
    {
      ...base,
      kind: "access",
      token_hash: hashSecret(access),
      expires_at: new Date(at + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString(),
    },
    {
      ...base,
      kind: "refresh",
      token_hash: hashSecret(refresh),
      expires_at: new Date(at + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString(),
    },
  ]);
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refresh,
    scope: args.scopes.join(" "),
  };
}

function required(params: URLSearchParams, name: string): string {
  const value = params.get(name);
  if (!value) {
    throw new OAuthTokenError("invalid_request", `${name} is required.`);
  }
  return value;
}

/**
 * POST /oauth/token for public clients (token_endpoint_auth_method none).
 * With no client secret, what binds the exchange to the party that started
 * the flow is PKCE plus the exact redirect URI, both checked here.
 */
export async function exchangeToken(
  store: OAuthStore,
  urls: OAuthUrls,
  params: URLSearchParams,
  now = new Date(),
): Promise<TokenResponse> {
  const grant = params.get("grant_type");
  const resourceParam = params.get("resource");
  if (resourceParam && !sameResource(resourceParam, urls.resource)) {
    throw new OAuthTokenError("invalid_target", "Tokens are only issued for this server's MCP resource.");
  }

  if (grant === "authorization_code") {
    const code = required(params, "code");
    const clientId = required(params, "client_id");
    const redirectUri = required(params, "redirect_uri");
    const verifier = required(params, "code_verifier");
    const codeHash = hashSecret(code);

    // Validate first, consume last. Consuming before validating let anyone
    // holding an intercepted code (but not the verifier) burn it and deny
    // the real client; and consuming before inserting left a window in which
    // a concurrent replay revoked nothing and the first exchange then minted
    // live tokens. Now tokens are inserted, bound to the code, *before* the
    // conditional consume, so whichever request loses the consume can revoke
    // everything issued from the code, including the winner's.
    const row = await store.getCode(codeHash);
    if (!row) {
      throw new OAuthTokenError("invalid_grant", "Unknown authorization code.");
    }
    if (row.used_at) {
      // A code presented twice was intercepted or the client is broken;
      // either way, nothing it produced should keep working.
      await store.revokeIssuedFromCode(codeHash, now);
      throw new OAuthTokenError("invalid_grant", "Authorization code was already used.");
    }
    if (Date.parse(row.expires_at) <= now.getTime()) {
      throw new OAuthTokenError("invalid_grant", "Authorization code has expired.");
    }
    if (row.client_id !== clientId || row.redirect_uri !== redirectUri) {
      throw new OAuthTokenError("invalid_grant", "Code was issued to a different client or redirect_uri.");
    }
    if (!verifyPkceS256(verifier, row.code_challenge)) {
      throw new OAuthTokenError("invalid_grant", "PKCE verification failed.");
    }
    if (!sameResource(row.resource, urls.resource)) {
      throw new OAuthTokenError("invalid_target", "Code was issued for a different resource.");
    }
    if (!(await store.isOperator(row.user_id))) {
      throw new OAuthTokenError("invalid_grant", "The approving account is no longer the operator.");
    }
    const client = await store.getClient(clientId);
    if (!client) {
      throw new OAuthTokenError("invalid_client", "Unknown client.");
    }
    const issued = await issuePair(store, {
      clientId,
      userId: row.user_id,
      principalName: principalNameFor(client),
      scopes: row.scopes,
      resource: row.resource,
      familyId: randomUUID(),
      codeHash,
      now,
    });
    const consumed = await store.consumeCode(codeHash, now);
    if (consumed.status !== "consumed") {
      await store.revokeIssuedFromCode(codeHash, now);
      throw new OAuthTokenError("invalid_grant", "Authorization code was already used.");
    }
    return issued;
  }

  if (grant === "refresh_token") {
    const presented = required(params, "refresh_token");
    const clientId = required(params, "client_id");
    const row = await store.findToken(hashSecret(presented));
    if (!row || row.kind !== "refresh") {
      throw new OAuthTokenError("invalid_grant", "Unknown refresh token.");
    }
    if (row.client_id !== clientId) {
      throw new OAuthTokenError("invalid_grant", "Refresh token was issued to a different client.");
    }
    if (row.revoked_at) {
      // A rotated-away refresh token coming back means two parties hold this
      // grant. Kill the family; the operator reconnects.
      await store.revokeFamily(row.family_id, now);
      throw new OAuthTokenError("invalid_grant", "Refresh token was already used or revoked.");
    }
    if (Date.parse(row.expires_at) <= now.getTime()) {
      throw new OAuthTokenError("invalid_grant", "Refresh token has expired.");
    }
    if (!sameResource(row.resource, urls.resource)) {
      throw new OAuthTokenError("invalid_target", "Refresh token belongs to a different resource.");
    }
    if (!(await store.isOperator(row.user_id))) {
      await store.revokeFamily(row.family_id, now);
      throw new OAuthTokenError("invalid_grant", "The approving account is no longer the operator.");
    }
    // Only a narrowing: a refresh can drop scopes, never add them.
    let scopes = row.scopes;
    const requested = params.get("scope");
    if (requested) {
      const asked = requested.split(/\s+/).filter(Boolean);
      if (asked.some((scope) => !row.scopes.includes(scope))) {
        throw new OAuthTokenError("invalid_scope", "A refresh cannot add scopes.");
      }
      scopes = asked;
    }
    // Insert the new pair into the family *before* retiring the old token.
    // If two refreshes race, the loser's family revocation then always
    // covers the winner's new tokens; revoking first let the winner's pair
    // be inserted after the family was killed and survive.
    const issued = await issuePair(store, {
      clientId,
      userId: row.user_id,
      principalName: row.principal_name,
      scopes,
      resource: row.resource,
      familyId: row.family_id,
      codeHash: row.code_hash,
      now,
    });
    if (!(await store.revokeToken(row.id, now))) {
      // Lost a race with another refresh of the same token: same as reuse.
      await store.revokeFamily(row.family_id, now);
      throw new OAuthTokenError("invalid_grant", "Refresh token was already used.");
    }
    return issued;
  }

  throw new OAuthTokenError(
    "unsupported_grant_type",
    "Supported grant types: authorization_code, refresh_token.",
  );
}

/** RFC 7009. Unknown tokens succeed silently, as the RFC requires. */
export async function revokePresentedToken(
  store: OAuthStore,
  token: string,
  now = new Date(),
): Promise<void> {
  const row = await store.findToken(hashSecret(token));
  if (!row) return;
  if (row.kind === "refresh") {
    await store.revokeFamily(row.family_id, now);
  } else {
    await store.revokeToken(row.id, now);
  }
}

export type AccessTokenCheck =
  | { ok: true; principal: AgentPrincipal; token: TokenRecord }
  | { ok: false; reason: "unknown" | "revoked" | "expired" | "wrong_resource" | "not_operator" };

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Stable identity for an OAuth client's namespaces (idempotency, rate
 * limits). The principal *name* is derived from the client's self-chosen
 * display name, so two clients can share it; the client id cannot collide.
 */
export function oauthPrincipalId(clientId: string): string {
  return `oauth:${createHash("sha256").update(clientId).digest("hex").slice(0, 24)}`;
}

/**
 * Resolves a bearer token at the MCP endpoint. Checked on every request:
 * existence, kind, expiry, revocation, the resource it was minted for, and
 * that the approving account is still the operator — demoting an account
 * cuts its connections without anyone remembering to revoke them.
 */
export async function verifyAccessToken(
  store: OAuthStore,
  urls: OAuthUrls,
  token: string,
  now = new Date(),
): Promise<AccessTokenCheck> {
  const row = await store.findToken(hashSecret(token));
  if (!row || row.kind !== "access") return { ok: false, reason: "unknown" };
  if (row.revoked_at) return { ok: false, reason: "revoked" };
  if (Date.parse(row.expires_at) <= now.getTime()) return { ok: false, reason: "expired" };
  if (!sameResource(row.resource, urls.resource)) return { ok: false, reason: "wrong_resource" };
  if (!(await store.isOperator(row.user_id))) return { ok: false, reason: "not_operator" };

  if (!row.last_used_at || now.getTime() - Date.parse(row.last_used_at) > TOUCH_INTERVAL_MS) {
    // Best effort: an audit timestamp must never fail a request.
    await store.touchToken(row.id, now).catch(() => {});
  }
  const scopes = row.scopes.filter(isAgentScope) as AgentScope[];
  return {
    ok: true,
    principal: { name: row.principal_name, scopes, id: oauthPrincipalId(row.client_id) },
    token: row,
  };
}
