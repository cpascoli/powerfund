import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { READ_SCOPES, WRITE_SCOPES } from "@/lib/api/agent/scopes";

import {
  grantedScopes,
  issueAuthorizationCode,
  validateAuthorizationRequest,
  type AuthorizeParams,
} from "./authorize";
import {
  fetchClientMetadataDocument,
  isAcceptableRedirectUri,
  principalNameFor,
  registerDynamicClient,
  resolveClient,
} from "./clients";
import { oauthUrls, parseScopeRequest, publicOrigin } from "./config";
import { verifyPkceS256 } from "./crypto";
import { authorizationServerMetadata, protectedResourceMetadata } from "./metadata";
import { memoryOAuthStore } from "./store";
import { exchangeToken, revokePresentedToken, verifyAccessToken } from "./token";

const urls = oauthUrls("https://powerfund.example");
const OPERATOR = "11111111-1111-4111-8111-111111111111";
const VIEWER = "22222222-2222-4222-8222-222222222222";
const VERIFIER = "a".repeat(20) + "-._~" + "B".repeat(30);
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");
const CHATGPT_CIMD = "https://chatgpt.com/oauth/client.json";
const CHATGPT_REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";
const T0 = new Date("2026-09-28T10:00:00Z");
const later = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

/** ChatGPT's published client metadata document, as fetched 2026-09-28. */
const chatgptDocument = {
  client_id: CHATGPT_CIMD,
  client_uri: "https://chatgpt.com/",
  redirect_uris: [CHATGPT_REDIRECT],
  token_endpoint_auth_method: "private_key_jwt",
  token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  client_name: "ChatGPT",
};

function fetchReturning(doc: unknown, status = 200) {
  const seen: string[] = [];
  const fetcher = async (url: string) => {
    seen.push(url);
    return new Response(JSON.stringify(doc), { status });
  };
  return Object.assign(fetcher, { seen });
}

function authorizeParams(overrides: AuthorizeParams = {}): AuthorizeParams {
  return {
    response_type: "code",
    client_id: CHATGPT_CIMD,
    redirect_uri: CHATGPT_REDIRECT,
    state: "st-123",
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
    resource: urls.resource,
    ...overrides,
  };
}

async function approve(
  store = memoryOAuthStore([OPERATOR]),
  choice: "read_write" | "read_only" = "read_write",
) {
  const fetcher = fetchReturning(chatgptDocument);
  const validation = await validateAuthorizationRequest(store, urls, authorizeParams(), {
    fetch: fetcher,
    now: T0,
  });
  if (!validation.ok) throw new Error(JSON.stringify(validation));
  const location = await issueAuthorizationCode(store, urls, validation.request, {
    userId: OPERATOR,
    scopes: grantedScopes(validation.request.scopes, choice),
    now: T0,
  });
  const code = new URL(location).searchParams.get("code")!;
  return { store, location, code };
}

function codeGrant(code: string, overrides: Record<string, string> = {}) {
  return new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: CHATGPT_CIMD,
    redirect_uri: CHATGPT_REDIRECT,
    code_verifier: VERIFIER,
    resource: urls.resource,
    ...overrides,
  });
}

describe("discovery metadata", () => {
  it("advertises what ChatGPT requires of an MCP authorization server", () => {
    const meta = authorizationServerMetadata(urls);
    expect(meta).toMatchObject({
      issuer: "https://powerfund.example",
      code_challenge_methods_supported: ["S256"],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
      token_endpoint_auth_methods_supported: ["none"],
      registration_endpoint: "https://powerfund.example/oauth/register",
    });
    expect([...meta.scopes_supported].sort()).toEqual([...WRITE_SCOPES].sort());
  });

  it("names the MCP endpoint as the protected resource", () => {
    expect(protectedResourceMetadata(urls)).toMatchObject({
      resource: "https://powerfund.example/api/v1/mcp",
      authorization_servers: ["https://powerfund.example"],
    });
  });

  it("uses a configured origin over the Host header", () => {
    const headers = new Headers({ host: "evil.example" });
    expect(publicOrigin(headers, { POWERFUND_PUBLIC_ORIGIN: "https://powerfund.netlify.app/" })).toBe(
      "https://powerfund.netlify.app",
    );
    expect(publicOrigin(headers, {})).toBe("https://evil.example");
    expect(publicOrigin(new Headers({ host: "localhost:3000" }), {})).toBe("http://localhost:3000");
  });
});

describe("client registration", () => {
  it("registers a public client with loopback or https redirects", async () => {
    const store = memoryOAuthStore();
    const client = await registerDynamicClient(store, {
      client_name: "MCP Inspector",
      redirect_uris: ["http://localhost:6274/oauth/callback"],
      token_endpoint_auth_method: "none",
    });
    expect(client.client_id).toMatch(/^pfc_/);
    expect(await store.getClient(client.client_id)).not.toBeNull();
    expect(principalNameFor(client)).toBe("mcp-inspector-mcp");
  });

  it.each([
    ["plain http off loopback", { redirect_uris: ["http://attacker.example/cb"] }],
    ["a fragment", { redirect_uris: ["https://x.example/cb#frag"] }],
    ["a custom scheme", { redirect_uris: ["javascript:alert(1)"] }],
    ["no redirect", { redirect_uris: [] }],
    ["a confidential client", { redirect_uris: ["https://x.example/cb"], token_endpoint_auth_method: "client_secret_basic" }],
  ])("refuses %s", async (_label, body) => {
    await expect(registerDynamicClient(memoryOAuthStore(), body)).rejects.toThrow();
  });

  it("accepts only exact redirect forms", () => {
    expect(isAcceptableRedirectUri("https://chatgpt.com/connector_platform_oauth_redirect")).toBe(true);
    expect(isAcceptableRedirectUri("http://127.0.0.1:33418/callback")).toBe(true);
    expect(isAcceptableRedirectUri("http://localhost.attacker.example/cb")).toBe(false);
  });
});

describe("client metadata documents", () => {
  it("accepts ChatGPT's real document, which supports public-client exchange", async () => {
    const client = await fetchClientMetadataDocument(CHATGPT_CIMD, {
      fetch: fetchReturning(chatgptDocument),
    });
    expect(client).toMatchObject({
      registration: "metadata_document",
      client_name: "ChatGPT",
      redirect_uris: [CHATGPT_REDIRECT],
    });
    expect(principalNameFor(client)).toBe("chatgpt-mcp");
  });

  it("will not fetch from a host outside the allowlist", async () => {
    const fetcher = fetchReturning(chatgptDocument);
    await expect(
      fetchClientMetadataDocument("https://attacker.example/client.json", { fetch: fetcher }),
    ).rejects.toThrow(/does not accept/);
    expect(fetcher.seen).toEqual([]);
  });

  it("refuses a document that does not name itself", async () => {
    await expect(
      fetchClientMetadataDocument(CHATGPT_CIMD, {
        fetch: fetchReturning({ ...chatgptDocument, client_id: "https://chatgpt.com/other.json" }),
      }),
    ).rejects.toThrow(/does not match/);
  });

  it("refuses a client that cannot do public-client token exchange", async () => {
    await expect(
      fetchClientMetadataDocument(CHATGPT_CIMD, {
        fetch: fetchReturning({
          ...chatgptDocument,
          token_endpoint_auth_methods_supported: ["private_key_jwt"],
        }),
      }),
    ).rejects.toThrow(/auth method/);
  });

  it("caches a document and refetches it when stale", async () => {
    const store = memoryOAuthStore();
    const fetcher = fetchReturning(chatgptDocument);
    await resolveClient(store, CHATGPT_CIMD, { fetch: fetcher, now: T0 });
    await resolveClient(store, CHATGPT_CIMD, { fetch: fetcher, now: later(3600) });
    expect(fetcher.seen).toHaveLength(1);
    await resolveClient(store, CHATGPT_CIMD, { fetch: fetcher, now: later(25 * 3600) });
    expect(fetcher.seen).toHaveLength(2);
  });
});

describe("authorization requests", () => {
  const validate = (params: AuthorizeParams) =>
    validateAuthorizationRequest(memoryOAuthStore(), urls, params, {
      fetch: fetchReturning(chatgptDocument),
      now: T0,
    });

  it("renders an error, never a redirect, when the redirect URI is not registered", async () => {
    const result = await validate(authorizeParams({ redirect_uri: "https://attacker.example/cb" }));
    expect(result).toMatchObject({ ok: false, kind: "fatal" });
  });

  it("renders an error for an unknown dynamic client", async () => {
    const result = await validate(authorizeParams({ client_id: "pfc_unknown" }));
    expect(result).toMatchObject({ ok: false, kind: "fatal" });
  });

  it("sends PKCE and resource errors back to the verified client with iss and state", async () => {
    for (const [overrides, error] of [
      [{ code_challenge_method: "plain" }, "invalid_request"],
      [{ code_challenge: undefined }, "invalid_request"],
      [{ response_type: "token" }, "unsupported_response_type"],
      [{ resource: "https://other.example/api/v1/mcp" }, "invalid_target"],
      [{ scope: "admin:everything" }, "invalid_scope"],
    ] as const) {
      const result = await validate(authorizeParams(overrides as AuthorizeParams));
      expect(result.ok).toBe(false);
      if (result.ok || result.kind !== "redirect") throw new Error(`expected redirect for ${error}`);
      const url = new URL(result.location);
      expect(url.origin + url.pathname).toBe(CHATGPT_REDIRECT);
      expect(url.searchParams.get("error")).toBe(error);
      expect(url.searchParams.get("state")).toBe("st-123");
      expect(url.searchParams.get("iss")).toBe(urls.issuer);
    }
  });

  it("defaults an absent resource to this server's MCP resource", async () => {
    const result = await validate(authorizeParams({ resource: undefined }));
    expect(result.ok && result.request.resource).toBe(urls.resource);
  });

  it("grants only known scopes, all of them when none are named", () => {
    expect([...parseScopeRequest("")].sort()).toEqual([...WRITE_SCOPES].sort());
    expect(parseScopeRequest("powerfund:state:read bogus")).toEqual(["powerfund:state:read"]);
  });

  it("lets read-only consent narrow the grant, never widen it", () => {
    expect(grantedScopes([...WRITE_SCOPES], "read_only").sort()).toEqual([...READ_SCOPES].sort());
    expect(grantedScopes(["powerfund:state:read"], "read_write")).toEqual(["powerfund:state:read"]);
  });
});

describe("authorization code exchange", () => {
  it("issues tokens bound to the resource, with iss on the redirect", async () => {
    const { store, location, code } = await approve();
    const url = new URL(location);
    expect(url.searchParams.get("iss")).toBe(urls.issuer);
    expect(url.searchParams.get("state")).toBe("st-123");
    expect(code).toMatch(/^pfac_/);

    const tokens = await exchangeToken(store, urls, codeGrant(code), later(10));
    expect(tokens.access_token).toMatch(/^pfat_/);
    expect(tokens.refresh_token).toMatch(/^pfrt_/);
    expect(tokens.token_type).toBe("Bearer");
    expect(tokens.scope.split(" ").sort()).toEqual([...WRITE_SCOPES].sort());

    // Only hashes are stored.
    const stored = JSON.stringify([...store.tokens.values(), ...store.codes.values()]);
    expect(stored).not.toContain(tokens.access_token);
    expect(stored).not.toContain(code);

    const check = await verifyAccessToken(store, urls, tokens.access_token, later(20));
    expect(check).toMatchObject({ ok: true, principal: { name: "chatgpt-mcp" } });
  });

  it("refuses a wrong PKCE verifier", async () => {
    const { store, code } = await approve();
    await expect(
      exchangeToken(store, urls, codeGrant(code, { code_verifier: "x".repeat(50) }), later(5)),
    ).rejects.toMatchObject({ code: "invalid_grant" });
  });

  it("refuses a different redirect_uri or client", async () => {
    const variants: Array<Record<string, string>> = [
      { redirect_uri: "https://chatgpt.com/other" },
      { client_id: "pfc_other" },
    ];
    for (const overrides of variants) {
      const { store, code } = await approve();
      await expect(exchangeToken(store, urls, codeGrant(code, overrides), later(5))).rejects.toMatchObject({
        code: "invalid_grant",
      });
    }
  });

  it("refuses an expired code", async () => {
    const { store, code } = await approve();
    await expect(exchangeToken(store, urls, codeGrant(code), later(121))).rejects.toMatchObject({
      code: "invalid_grant",
    });
  });

  it("refuses a code minted for a different deployment's resource", async () => {
    const { store, code } = await approve();
    const preview = oauthUrls("https://deploy-preview-7--powerfund.netlify.app");
    await expect(exchangeToken(store, preview, codeGrant(code, { resource: "" }), later(5))).rejects.toMatchObject({
      code: "invalid_target",
    });
  });

  it("treats a replayed code as theft and revokes what the first exchange issued", async () => {
    const { store, code } = await approve();
    const first = await exchangeToken(store, urls, codeGrant(code), later(5));
    await expect(exchangeToken(store, urls, codeGrant(code), later(6))).rejects.toMatchObject({
      code: "invalid_grant",
    });
    expect(await verifyAccessToken(store, urls, first.access_token, later(7))).toMatchObject({
      ok: false,
      reason: "revoked",
    });
  });

  it("refuses the exchange if the approver is no longer the operator", async () => {
    const { store, code } = await approve();
    store.operators.delete(OPERATOR);
    await expect(exchangeToken(store, urls, codeGrant(code), later(5))).rejects.toMatchObject({
      code: "invalid_grant",
    });
  });

  it("gives a read-only grant read scopes only", async () => {
    const { store, code } = await approve(undefined, "read_only");
    const tokens = await exchangeToken(store, urls, codeGrant(code), later(5));
    expect(tokens.scope.split(" ").sort()).toEqual([...READ_SCOPES].sort());
  });
});

describe("refresh tokens", () => {
  async function issued() {
    const { store, code } = await approve();
    const tokens = await exchangeToken(store, urls, codeGrant(code), later(5));
    return { store, tokens };
  }
  const refresh = (token: string, extra: Record<string, string> = {}) =>
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: token, client_id: CHATGPT_CIMD, ...extra });

  it("rotates: the new pair works and the old refresh token does not", async () => {
    const { store, tokens } = await issued();
    const next = await exchangeToken(store, urls, refresh(tokens.refresh_token), later(4000));
    expect(next.refresh_token).not.toBe(tokens.refresh_token);
    expect((await verifyAccessToken(store, urls, next.access_token, later(4001))).ok).toBe(true);
    await expect(exchangeToken(store, urls, refresh(tokens.refresh_token), later(4002))).rejects.toMatchObject({
      code: "invalid_grant",
    });
  });

  it("revokes the whole family when a rotated refresh token is reused", async () => {
    const { store, tokens } = await issued();
    const next = await exchangeToken(store, urls, refresh(tokens.refresh_token), later(4000));
    await exchangeToken(store, urls, refresh(tokens.refresh_token), later(4001)).catch(() => {});
    expect((await verifyAccessToken(store, urls, next.access_token, later(4002))).ok).toBe(false);
    await expect(exchangeToken(store, urls, refresh(next.refresh_token), later(4003))).rejects.toMatchObject({
      code: "invalid_grant",
    });
  });

  it("can narrow scopes on refresh", async () => {
    const { store, tokens } = await issued();
    const narrowed = await exchangeToken(
      store,
      urls,
      refresh(tokens.refresh_token, { scope: "powerfund:state:read" }),
      later(10),
    );
    expect(narrowed.scope).toBe("powerfund:state:read");
  });

  it("cannot add a scope on refresh", async () => {
    const readOnly = await approve(undefined, "read_only");
    const tokens = await exchangeToken(readOnly.store, urls, codeGrant(readOnly.code), later(5));
    await expect(
      exchangeToken(
        readOnly.store,
        urls,
        refresh(tokens.refresh_token, { scope: "powerfund:dossier:write" }),
        later(10),
      ),
    ).rejects.toMatchObject({ code: "invalid_scope" });
  });

  it("refuses an access token presented as a refresh token", async () => {
    const { store, tokens } = await issued();
    await expect(exchangeToken(store, urls, refresh(tokens.access_token), later(10))).rejects.toMatchObject({
      code: "invalid_grant",
    });
  });
});

describe("access token verification", () => {
  it("expires after an hour", async () => {
    const { store, code } = await approve();
    const tokens = await exchangeToken(store, urls, codeGrant(code), T0);
    expect((await verifyAccessToken(store, urls, tokens.access_token, later(3599))).ok).toBe(true);
    expect(await verifyAccessToken(store, urls, tokens.access_token, later(3600))).toMatchObject({
      ok: false,
      reason: "expired",
    });
  });

  it("stops working the moment the account stops being the operator", async () => {
    const { store, code } = await approve();
    const tokens = await exchangeToken(store, urls, codeGrant(code), T0);
    store.operators.delete(OPERATOR);
    store.operators.add(VIEWER);
    expect(await verifyAccessToken(store, urls, tokens.access_token, later(1))).toMatchObject({
      ok: false,
      reason: "not_operator",
    });
  });

  it("is not accepted by another deployment sharing the database", async () => {
    const { store, code } = await approve();
    const tokens = await exchangeToken(store, urls, codeGrant(code), T0);
    const preview = oauthUrls("https://deploy-preview-7--powerfund.netlify.app");
    expect(await verifyAccessToken(store, preview, tokens.access_token, later(1))).toMatchObject({
      ok: false,
      reason: "wrong_resource",
    });
  });

  it("is revoked by RFC 7009 revocation of its refresh token", async () => {
    const { store, code } = await approve();
    const tokens = await exchangeToken(store, urls, codeGrant(code), T0);
    await revokePresentedToken(store, tokens.refresh_token, later(1));
    expect((await verifyAccessToken(store, urls, tokens.access_token, later(2))).ok).toBe(false);
  });
});

describe("PKCE", () => {
  it("verifies S256 and rejects malformed verifiers", () => {
    expect(verifyPkceS256(VERIFIER, CHALLENGE)).toBe(true);
    expect(verifyPkceS256("short", CHALLENGE)).toBe(false);
    expect(verifyPkceS256(VERIFIER + "x", CHALLENGE)).toBe(false);
  });
});
