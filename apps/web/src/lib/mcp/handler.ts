import { randomUUID } from "node:crypto";

import {
  createMcpHandler,
  isJsonContentType,
  isLegacyRequest,
  WebStandardStreamableHTTPServerTransport,
  type AuthInfo,
} from "@modelcontextprotocol/server";

import { clientKey, rateLimit } from "@/lib/api/v1/rate-limit";
import type { AgentPrincipal } from "@/lib/api/agent/auth";
import { oauthUrls, publicOrigin, type OAuthUrls } from "@/lib/oauth/config";
import type { OAuthStore } from "@/lib/oauth/store";

import { InProcessAgentClient, type PowerFundAgentClient } from "./agent-client";
import { authenticateMcpRequest, wwwAuthenticate } from "./auth";
import { createMcpLogger, type McpLogger } from "./log";
import { createPowerFundMcpServer } from "./server";

export const MAX_MCP_BODY_BYTES = 1024 * 1024;

export type McpHandlerDeps = {
  store: () => OAuthStore;
  /** Defaults to the in-process client over the real agent routes. */
  client?: (principal: AgentPrincipal, context: { origin: string; clientAddress: string }) => PowerFundAgentClient;
  logger?: (requestId: string) => McpLogger;
  agentKeys?: string;
  toolTimeoutMs?: number;
  now?: () => Date;
};

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version",
};

function withHeaders(response: Response, requestId: string, extra?: Record<string, string>): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries({ ...CORS_HEADERS, ...extra })) {
    headers.set(key, value);
  }
  headers.set("Cache-Control", "no-store");
  headers.set("X-Request-Id", requestId);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function jsonRpcError(status: number, code: number, message: string, headers?: Record<string, string>) {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }),
    { status, headers: { "Content-Type": "application/json", ...headers } },
  );
}

function rpcMethods(body: unknown): string[] {
  const messages = Array.isArray(body) ? body : [body];
  return messages
    .map((row) =>
      row && typeof row === "object" && typeof (row as { method?: unknown }).method === "string"
        ? (row as { method: string }).method
        : "response",
    )
    .slice(0, 20);
}

export function mcpPreflight(): Response {
  return new Response(null, { status: 204, headers: { ...CORS_HEADERS, "Access-Control-Max-Age": "600" } });
}

/**
 * Stateless Streamable HTTP. Each POST is authenticated, served by a fresh
 * server and transport, and answered with plain JSON — no session id, no SSE
 * stream held open, nothing kept in memory between requests. That is what a
 * serverless function can honour: the next request may land on another
 * instance, and a stream would be cut at the platform's execution limit.
 */
export async function handleMcpRequest(request: Request, deps: McpHandlerDeps): Promise<Response> {
  const requestId = randomUUID();
  const started = Date.now();
  const logger = (deps.logger ?? createMcpLogger)(requestId);
  const now = deps.now ?? (() => new Date());

  let urls: OAuthUrls;
  try {
    urls = oauthUrls(publicOrigin(request.headers));
  } catch {
    return withHeaders(jsonRpcError(400, -32600, "Missing Host header."), requestId);
  }

  const log = (status: number, extra: Partial<Parameters<McpLogger["request"]>[0]> = {}) =>
    logger.request({
      method: request.method,
      rpc: [],
      status,
      duration_ms: Date.now() - started,
      ...extra,
    });

  if (request.method !== "POST") {
    // No server-initiated stream in stateless mode, and no session to DELETE.
    // The spec's answer to both is 405.
    log(405);
    return withHeaders(jsonRpcError(405, -32000, "Method not allowed. POST JSON-RPC to this endpoint."), requestId, {
      Allow: "POST, OPTIONS",
    });
  }

  const address = clientKey(request);
  let auth: Awaited<ReturnType<typeof authenticateMcpRequest>>;
  try {
    auth = await authenticateMcpRequest(request, {
      store: deps.store,
    urls,
      now: now(),
      agentKeys: deps.agentKeys,
    });
  } catch (error) {
    // Misconfiguration (no Supabase, malformed agent keys), not a bad token.
    logger.error("mcp.auth.unavailable", error);
    log(503, { auth: "none", auth_error: "unavailable" });
    return withHeaders(jsonRpcError(503, -32000, "PowerFund authentication is unavailable."), requestId);
  }
  if (!auth.ok) {
    // Count failures per address so a token-guessing loop meets a wall before
    // it meets the database. Successful calls are limited downstream, per
    // principal, by the agent API itself.
    const limited = rateLimit(`mcp-auth-fail:${address}`);
    log(limited.ok ? 401 : 429, { auth: "none", auth_error: auth.error });
    if (!limited.ok) {
      return withHeaders(jsonRpcError(429, -32000, "Too many failed authentication attempts."), requestId, {
        "Retry-After": String(limited.retryAfterSeconds),
      });
    }
    return withHeaders(jsonRpcError(401, -32001, auth.description), requestId, {
      "WWW-Authenticate": wwwAuthenticate(urls, auth),
    });
  }

  if (!isJsonContentType(request.headers.get("content-type"))) {
    log(415, { principal: auth.principal.name, auth: auth.method });
    return withHeaders(jsonRpcError(415, -32600, "Content-Type must be application/json."), requestId);
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_MCP_BODY_BYTES) {
    log(413, { principal: auth.principal.name, auth: auth.method });
    return withHeaders(jsonRpcError(413, -32600, "Request body too large."), requestId);
  }
  const text = await request.text();
  if (text.length > MAX_MCP_BODY_BYTES) {
    log(413, { principal: auth.principal.name, auth: auth.method });
    return withHeaders(jsonRpcError(413, -32600, "Request body too large."), requestId);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    log(400, { principal: auth.principal.name, auth: auth.method });
    return withHeaders(jsonRpcError(400, -32700, "Parse error: body is not JSON."), requestId);
  }

  const origin = new URL(urls.issuer).origin;
  const client = deps.client
    ? deps.client(auth.principal, { origin, clientAddress: address })
    : new InProcessAgentClient(auth.principal, { origin, clientAddress: address });
  // One definition of the server for both protocol eras, so a 2025-era client
  // and a 2026-07-28 client can never see different tools or rules.
  const buildServer = () =>
    createPowerFundMcpServer({
      principal: auth.principal,
      client,
      logger,
      resourceMetadataUrl: urls.resourceMetadata,
      toolTimeoutMs: deps.toolTimeoutMs,
      now,
    });
  const authInfo: AuthInfo = {
    token: auth.token,
    clientId: auth.clientId,
    scopes: [...auth.principal.scopes],
    expiresAt: auth.expiresAt,
    resource: new URL(urls.resource),
    extra: { principal: auth.principal.name },
  };

  let status = 500;
  const cleanup: Array<() => Promise<unknown>> = [];
  try {
    let response: Response;
    if (await isLegacyRequest(request, body)) {
      // 2025-era clients (ChatGPT and MCP Inspector today): the stateless
      // idiom — a fresh server and transport, no session id — answered with
      // one JSON body rather than an SSE stream, so nothing is held open
      // against the function's execution limit.
      const server = buildServer();
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      cleanup.push(() => transport.close(), () => server.close());
      await server.connect(transport);
      response = await transport.handleRequest(request, { parsedBody: body, authInfo });
    } else {
      // 2026-07-28 clients: the revision is stateless by design (no
      // initialize, no sessions), which is what the SDK's per-request
      // handler serves. JSON responses for the same reason as above.
      const modern = createMcpHandler(buildServer, { legacy: "reject", responseMode: "json" });
      cleanup.push(() => modern.close());
      response = await modern.fetch(request, { parsedBody: body, authInfo });
    }
    status = response.status;
    return withHeaders(response, requestId);
  } catch (error) {
    logger.error("mcp.request.unexpected", error);
    return withHeaders(jsonRpcError(500, -32603, "Internal error in the PowerFund MCP adapter."), requestId);
  } finally {
    log(status, { rpc: rpcMethods(body), principal: auth.principal.name, auth: auth.method });
    for (const close of cleanup) await close().catch(() => {});
  }
}
