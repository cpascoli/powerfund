import { randomToken } from "./crypto";
import {
  CLIENT_METADATA_MAX_AGE_SECONDS,
  clientMetadataHosts,
  TOKEN_PREFIX,
} from "./config";
import type { ClientRecord, OAuthStore } from "./store";

export class OAuthClientError extends Error {
  constructor(
    readonly code: "invalid_client" | "invalid_client_metadata" | "invalid_redirect_uri",
    message: string,
  ) {
    super(message);
    this.name = "OAuthClientError";
  }
}

const MAX_METADATA_BYTES = 64 * 1024;
const MAX_REDIRECT_URIS = 10;

/**
 * Redirect URIs we will send a code to: HTTPS anywhere, or plain HTTP only on
 * a loopback address (MCP Inspector and CLI clients run a local listener).
 * No fragments, per RFC 6749 §3.1.2.
 */
export function isAcceptableRedirectUri(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:") {
    return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  }
  return false;
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((row) => typeof row === "string")
    ? (value as string[])
    : null;
}

function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/[\u0000-\u001f]/g, "").trim();
  return trimmed ? trimmed.slice(0, 80) : null;
}

/**
 * RFC 7591 dynamic registration. Anyone can register — registration grants
 * nothing; the operator's consent does — so the rules are about what we would
 * later redirect to, not about who is asking.
 */
export async function registerDynamicClient(
  store: OAuthStore,
  body: unknown,
  now = new Date(),
): Promise<ClientRecord> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new OAuthClientError("invalid_client_metadata", "Body must be a JSON object.");
  }
  const record = body as Record<string, unknown>;
  const redirects = stringArray(record.redirect_uris);
  if (!redirects || redirects.length === 0 || redirects.length > MAX_REDIRECT_URIS) {
    throw new OAuthClientError(
      "invalid_redirect_uri",
      `redirect_uris must list 1 to ${MAX_REDIRECT_URIS} URIs.`,
    );
  }
  const bad = redirects.filter((uri) => !isAcceptableRedirectUri(uri));
  if (bad.length > 0) {
    throw new OAuthClientError(
      "invalid_redirect_uri",
      "Redirect URIs must be https, or http on a loopback address, with no fragment.",
    );
  }
  const method = record.token_endpoint_auth_method;
  if (method !== undefined && method !== "none") {
    throw new OAuthClientError(
      "invalid_client_metadata",
      "Only public clients are supported: token_endpoint_auth_method must be none.",
    );
  }
  const grantTypes = stringArray(record.grant_types) ?? ["authorization_code"];
  if (grantTypes.some((grant) => grant !== "authorization_code" && grant !== "refresh_token")) {
    throw new OAuthClientError(
      "invalid_client_metadata",
      "Only authorization_code and refresh_token grants are supported.",
    );
  }

  const client: ClientRecord = {
    client_id: randomToken(TOKEN_PREFIX.client),
    registration: "dynamic",
    client_name: cleanName(record.client_name),
    redirect_uris: [...new Set(redirects)],
    metadata: {
      client_uri: typeof record.client_uri === "string" ? record.client_uri : undefined,
      grant_types: grantTypes,
    },
    refreshed_at: now.toISOString(),
  };
  await store.saveClient(client);
  return client;
}

export function isMetadataDocumentClientId(clientId: string): boolean {
  return clientId.startsWith("https://");
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Client ID Metadata Documents: the client id *is* an HTTPS URL, and the
 * document at it lists the client's redirect URIs. ChatGPT prefers this to
 * dynamic registration.
 */
export async function fetchClientMetadataDocument(
  clientId: string,
  args: { fetch?: FetchLike; hosts?: string[]; now?: Date } = {},
): Promise<ClientRecord> {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    throw new OAuthClientError("invalid_client", "client_id is not a valid URL.");
  }
  const hosts = args.hosts ?? clientMetadataHosts();
  if (url.protocol !== "https:" || url.pathname === "/" || url.hash || url.username || url.password) {
    throw new OAuthClientError(
      "invalid_client",
      "A metadata-document client_id must be an https URL with a path.",
    );
  }
  if (!hosts.includes(url.hostname.toLowerCase())) {
    throw new OAuthClientError(
      "invalid_client",
      `PowerFund does not accept client metadata documents from ${url.hostname}. Register the client dynamically instead.`,
    );
  }

  const doFetch = args.fetch ?? fetch;
  let response: Response;
  try {
    response = await doFetch(url.toString(), {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new OAuthClientError("invalid_client", "Could not fetch the client metadata document.");
  }
  if (!response.ok) {
    throw new OAuthClientError(
      "invalid_client",
      `Client metadata document returned HTTP ${response.status}.`,
    );
  }
  const text = await response.text();
  if (text.length > MAX_METADATA_BYTES) {
    throw new OAuthClientError("invalid_client", "Client metadata document is too large.");
  }
  let doc: Record<string, unknown>;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error();
    doc = parsed as Record<string, unknown>;
  } catch {
    throw new OAuthClientError("invalid_client", "Client metadata document is not a JSON object.");
  }

  // The document must name itself, or any URL on an allowed host could
  // impersonate another client's redirect list.
  if (doc.client_id !== clientId) {
    throw new OAuthClientError(
      "invalid_client",
      "Client metadata document's client_id does not match its URL.",
    );
  }
  const redirects = stringArray(doc.redirect_uris)?.filter(isAcceptableRedirectUri) ?? [];
  if (redirects.length === 0) {
    throw new OAuthClientError("invalid_client", "Client metadata document lists no usable redirect_uris.");
  }
  // We only run public-client token exchange. A client that can do nothing
  // else cannot complete the flow, so refuse it here rather than at /token.
  const methods =
    stringArray(doc.token_endpoint_auth_methods_supported) ??
    (typeof doc.token_endpoint_auth_method === "string" ? [doc.token_endpoint_auth_method] : ["none"]);
  if (!methods.includes("none")) {
    throw new OAuthClientError(
      "invalid_client",
      "This client requires a token endpoint auth method PowerFund does not support.",
    );
  }

  return {
    client_id: clientId,
    registration: "metadata_document",
    client_name: cleanName(doc.client_name),
    redirect_uris: redirects.slice(0, MAX_REDIRECT_URIS),
    metadata: {
      client_uri: typeof doc.client_uri === "string" ? doc.client_uri : undefined,
      logo_uri: typeof doc.logo_uri === "string" ? doc.logo_uri : undefined,
    },
    refreshed_at: (args.now ?? new Date()).toISOString(),
  };
}

/**
 * The client for an authorization request, from cache or, for a metadata
 * document, fetched when missing or stale. Fetching happens only after the
 * operator is signed in (see the authorize page), so an anonymous visitor
 * cannot make this server fetch anything.
 */
export async function resolveClient(
  store: OAuthStore,
  clientId: string,
  args: { fetch?: FetchLike; hosts?: string[]; now?: Date } = {},
): Promise<ClientRecord> {
  const now = args.now ?? new Date();
  const cached = await store.getClient(clientId);
  if (!isMetadataDocumentClientId(clientId)) {
    if (!cached) {
      throw new OAuthClientError("invalid_client", "Unknown client_id. Register the client first.");
    }
    return cached;
  }
  const fresh =
    cached &&
    now.getTime() - Date.parse(cached.refreshed_at) < CLIENT_METADATA_MAX_AGE_SECONDS * 1000;
  if (fresh) return cached;
  const fetched = await fetchClientMetadataDocument(clientId, { ...args, now });
  await store.saveClient(fetched);
  return fetched;
}

export function clientDisplayName(client: ClientRecord): string {
  if (client.client_name) return client.client_name;
  if (client.registration === "metadata_document") return new URL(client.client_id).hostname;
  return "Unnamed client";
}

/** Attribution stamped on writes: "chatgpt-mcp", "mcp-inspector-mcp", … */
export function principalNameFor(client: ClientRecord): string {
  const slug = clientDisplayName(client)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${slug || "oauth-client"}-mcp`;
}
