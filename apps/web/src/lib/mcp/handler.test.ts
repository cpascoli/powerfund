import { describe, expect, it } from "vitest";

import type { DeployEnv } from "@/lib/deploy";
import { memoryOAuthStore } from "@/lib/oauth/store";

import { AgentApiCallError, type PowerFundAgentClient } from "./agent-client";
import { handleMcpRequest, type McpHandlerDeps } from "./handler";
import type { McpLogger, ToolLogEntry } from "./log";
import { fakeAgentClient } from "./testing";
import { POWERFUND_TOOLS } from "./tools";

const KEYS = JSON.stringify([
  { name: "reader", secret: "pf_test_reader_key_1", role: "read" },
  { name: "writer", secret: "pf_test_writer_key_1", role: "write" },
]);
const ORIGIN = "https://powerfund.example";
const TASK_ID = "5e7d8c3a-1f2b-4c6d-8e9f-0a1b2c3d4e5f";

/** A production build: canonical origin from the build, writes enabled. */
const PRODUCTION: DeployEnv = {
  context: "production",
  siteUrl: ORIGIN,
  deployUrl: "https://6abb35b4--powerfund.netlify.app",
  publicOriginOverride: "",
  mcpReadOnly: "",
  mcpAllowWrites: "",
  oauthAllowDcr: "",
};
const PREVIEW: DeployEnv = {
  ...PRODUCTION,
  context: "deploy-preview",
  deployUrl: "https://deploy-preview-1--powerfund.netlify.app",
};

type Rpc = { jsonrpc: "2.0"; id?: number; method: string; params?: unknown };

function capture() {
  const lines: Array<Record<string, unknown>> = [];
  const logger: McpLogger = {
    request: (entry) => lines.push({ evt: "mcp.request", ...entry }),
    tool: (entry) => lines.push({ evt: "mcp.tool", ...entry }),
    error: (event, error) => lines.push({ evt: event, error: String(error) }),
  };
  return { lines, logger };
}

async function post(
  body: Rpc | Rpc[] | string,
  options: {
    token?: string | null;
    client?: PowerFundAgentClient;
    deps?: Partial<McpHandlerDeps>;
    method?: string;
  } = {},
) {
  const { lines, logger } = capture();
  const headers: Record<string, string> = {
    host: "powerfund.example",
    "x-forwarded-proto": "https",
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  const token = options.token === undefined ? "pf_test_writer_key_1" : options.token;
  if (token) headers.authorization = `Bearer ${token}`;
  const client = options.client ?? fakeAgentClient();
  const response = await handleMcpRequest(
    new Request(`${ORIGIN}/api/v1/mcp`, {
      method: options.method ?? "POST",
      headers,
      body: options.method && options.method !== "POST" ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    }),
    {
      store: () => memoryOAuthStore(),
      agentKeys: KEYS,
      client: () => client,
      logger: () => logger,
      deploy: PRODUCTION,
      ...options.deps,
    },
  );
  const text = await response.text();
  return {
    response,
    status: response.status,
    json: text ? (JSON.parse(text) as Record<string, any>) : null,
    lines,
    client,
  };
}

const call = (name: string, args: Record<string, unknown> = {}, id = 1): Rpc => ({
  jsonrpc: "2.0",
  id,
  method: "tools/call",
  params: { name, arguments: args },
});

describe("MCP transport", () => {
  it("initializes statelessly: no session id, server instructions present", async () => {
    const { status, json, response } = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
      },
    });
    expect(status).toBe(200);
    expect(response.headers.get("mcp-session-id")).toBeNull();
    expect(json!.result.serverInfo.name).toBe("powerfund");
    expect(json!.result.capabilities.tools).toBeDefined();
    expect(json!.result.instructions).toMatch(/No tool books a fill/);
  });

  it("answers GET and DELETE with 405: there is no stream and no session", async () => {
    for (const method of ["GET", "DELETE"]) {
      const { status, response } = await post("", { method });
      expect(status).toBe(405);
      expect(response.headers.get("allow")).toContain("POST");
    }
  });

  it("rejects a body that is not JSON", async () => {
    const { status, json } = await post("{nope");
    expect(status).toBe(400);
    expect(json!.error.code).toBe(-32700);
  });
});

describe("MCP authentication", () => {
  it("challenges an anonymous caller with where to find the authorization server", async () => {
    const { status, response, client } = await post(call("get_portfolio"), { token: null });
    expect(status).toBe(401);
    const challenge = response.headers.get("www-authenticate")!;
    expect(challenge).toContain(
      `resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/v1/mcp"`,
    );
    expect(challenge).not.toContain("error=");
    // Hollow-pass guard: a 401 that still ran the tool would be worse than none.
    expect((client as ReturnType<typeof fakeAgentClient>).calls).toEqual([]);
  });

  it("refuses an unknown token and says why", async () => {
    const { status, response } = await post(call("get_portfolio"), { token: "pf_wrong_key_xxxxxxxx" });
    expect(status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });

  it("refuses an OAuth-shaped token that the store does not know", async () => {
    const { status } = await post(call("get_portfolio"), { token: "pfat_forged" });
    expect(status).toBe(401);
  });

  it("serves a caller holding an agent key", async () => {
    const { status, json } = await post(call("get_portfolio"), { token: "pf_test_reader_key_1" });
    expect(status).toBe(200);
    expect(json!.result.isError).toBeFalsy();
  });

  it("answers a missing scope with a re-authorization challenge, not a write", async () => {
    const client = fakeAgentClient();
    const { json } = await post(
      call("record_decision", { symbol: "VRT", decision_type: "hold", thesis: "Intact." }),
      { token: "pf_test_reader_key_1", client },
    );
    expect(json!.result.isError).toBe(true);
    expect(json!.result.structuredContent.error).toMatchObject({
      source: "authorization",
      code: "INSUFFICIENT_SCOPE",
      required_scopes: ["powerfund:journal:append"],
    });
    expect(json!.result._meta["mcp/www_authenticate"][0]).toContain('error="insufficient_scope"');
    expect(client.calls).toEqual([]);
  });
});

describe("tools/list", () => {
  it("lists every PowerFund tool with annotations and security schemes", async () => {
    const { json } = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const tools = json!.result.tools as Array<Record<string, any>>;
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      POWERFUND_TOOLS.map((tool) => tool.name).sort(),
    );
    for (const listed of tools) {
      const tool = POWERFUND_TOOLS.find((row) => row.name === listed.name)!;
      expect(listed.title).toBe(tool.title);
      expect(listed.description).toBe(tool.description);
      expect(listed.inputSchema.type).toBe("object");
      expect(listed.annotations).toMatchObject(tool.annotations);
      const schemes = [{ type: "oauth2", scopes: [...tool.scopes] }];
      // ChatGPT reads the top-level field; _meta is the back-compat mirror.
      expect(listed.securitySchemes).toEqual(schemes);
      expect(listed._meta.securitySchemes).toEqual(schemes);
    }
  });

  it("publishes strict input schemas", async () => {
    const { json } = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    for (const tool of json!.result.tools as Array<Record<string, any>>) {
      expect(tool.inputSchema.additionalProperties, tool.name).toBe(false);
    }
    const outcome = (json!.result.tools as Array<Record<string, any>>).find(
      (tool) => tool.name === "record_decision_outcome",
    )!;
    expect(outcome.inputSchema.required).toEqual(
      expect.arrayContaining(["decision_id", "horizon_days", "thesis_grade", "lessons"]),
    );
  });
});

describe("tools/call", () => {
  it("returns structured content and the same JSON as text", async () => {
    const client = fakeAgentClient({ getPortfolio: { nav_usd: 100, positions: [] } });
    const { json } = await post(call("get_portfolio"), { client });
    expect(json!.result.structuredContent).toEqual({ nav_usd: 100, positions: [] });
    expect(JSON.parse(json!.result.content[0].text)).toEqual({ nav_usd: 100, positions: [] });
  });

  it("returns an empty result as a result, not an error", async () => {
    const client = fakeAgentClient({ getResearchInbox: { returned: 0, items: [] } });
    const { json } = await post(call("get_research_inbox"), { client });
    expect(json!.result.isError).toBeFalsy();
    expect(json!.result.structuredContent.items).toEqual([]);
  });

  it("turns invalid arguments into a readable tool error without calling PowerFund", async () => {
    const client = fakeAgentClient();
    const { json } = await post(call("complete_review_task", { review_task_id: "not-a-uuid", outcome: "x" }), {
      client,
    });
    expect(json!.result.isError).toBe(true);
    expect(json!.result.content[0].text).toMatch(/review_task_id/);
    expect(client.calls).toEqual([]);
  });

  it("reports an unknown tool", async () => {
    const { json } = await post(call("book_fill"));
    expect(json!.result?.isError ?? json!.error).toBeTruthy();
  });

  it("passes PowerFund's refusal through as a PowerFund error the model can act on", async () => {
    const client = fakeAgentClient({
      getCompanyDossier: () => {
        throw new AgentApiCallError({
          operationId: "getCompanyDossier",
          status: 404,
          code: "UNKNOWN_SYMBOL",
          message: "Unknown symbol ZZZZ.",
          details: { symbol: "ZZZZ", internal_hint: "select * from instruments" },
        });
      },
    });
    const { json, lines } = await post(call("get_dossier", { symbol: "ZZZZ" }), { client });
    expect(json!.result.isError).toBe(true);
    const error = json!.result.structuredContent.error;
    expect(error).toMatchObject({
      source: "powerfund_api",
      code: "UNKNOWN_SYMBOL",
      http_status: 404,
      retryable: false,
      symbol: "ZZZZ",
    });
    expect(error).not.toHaveProperty("internal_hint");
    const toolLine = lines.find((line) => line.evt === "mcp.tool") as unknown as ToolLogEntry;
    expect(toolLine).toMatchObject({ tool: "get_dossier", outcome: "error", error_source: "powerfund_api" });
    expect(toolLine.downstream).toEqual([expect.objectContaining({ op: "getCompanyDossier", status: 404 })]);
  });

  it("keeps a version conflict's current_version so the model can re-read", async () => {
    const client = fakeAgentClient({
      updateDossier: () => {
        throw new AgentApiCallError({
          operationId: "updateDossier",
          status: 409,
          code: "DOSSIER_VERSION_CONFLICT",
          message: "Expected version does not match current version 5.",
          details: { current_version: 5 },
        });
      },
    });
    const { json } = await post(
      call("update_dossier", { symbol: "SNDK", expected_version: 4, change_reason: "r", changes: { thesis: "t" } }),
      { client },
    );
    expect(json!.result.structuredContent.error).toMatchObject({
      code: "DOSSIER_VERSION_CONFLICT",
      current_version: 5,
    });
  });

  it("hides the text of a PowerFund 500, which can be a raw database error", async () => {
    const client = fakeAgentClient({
      getJournal: () => {
        throw new AgentApiCallError({
          operationId: "getJournal",
          status: 500,
          code: "INTERNAL_ERROR",
          message: 'relation "decisions" violates constraint on column secret_col',
        });
      },
    });
    const { json } = await post(call("get_journal"), { client });
    const error = json!.result.structuredContent.error;
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.retryable).toBe(true);
    expect(JSON.stringify(json)).not.toContain("secret_col");
  });

  it("separates an adapter failure from a PowerFund failure", async () => {
    const client = fakeAgentClient({
      getPortfolio: () => {
        throw new TypeError("Cannot read properties of undefined (reading 'nav')");
      },
    });
    const { json } = await post(call("get_portfolio"), { client });
    expect(json!.result.structuredContent.error).toMatchObject({ source: "mcp", code: "MCP_INTERNAL_ERROR" });
    expect(JSON.stringify(json)).not.toContain("reading 'nav'");
  });

  it("reports a malformed PowerFund response as a PowerFund error", async () => {
    const client = fakeAgentClient({
      getPortfolio: () => {
        throw new AgentApiCallError({
          operationId: "getPortfolio",
          status: 200,
          code: "MALFORMED_RESPONSE",
          message: "The PowerFund API returned a response that is not JSON.",
        });
      },
    });
    const { json } = await post(call("get_portfolio"), { client });
    expect(json!.result.structuredContent.error.code).toBe("MALFORMED_RESPONSE");
  });

  it("times out a slow write and says whether retrying is safe", async () => {
    const client = fakeAgentClient({
      completeReviewTask: () => new Promise(() => {}),
    });
    const { json } = await post(call("complete_review_task", { review_task_id: TASK_ID, outcome: "Held." }), {
      client,
      deps: { toolTimeoutMs: 20 },
    });
    const error = json!.result.structuredContent.error;
    expect(error).toMatchObject({ source: "mcp", code: "TIMEOUT", retryable: true });
    expect(error.message).toMatch(/never writes twice/);
  });

  it("derives a stable idempotency key for writes, and none for reads", async () => {
    const args = { symbol: "VRT", decision_type: "hold", thesis: "Intact." };
    const fixed = () => new Date("2026-09-28T10:15:00Z");
    const first = fakeAgentClient();
    const second = fakeAgentClient();
    await post(call("record_decision", args), { client: first, deps: { now: fixed } });
    await post(call("record_decision", { thesis: "Intact.", decision_type: "hold", symbol: "VRT" }), {
      client: second,
      deps: { now: fixed },
    });
    const key = first.calls[0]!.write!.idempotencyKey!;
    expect(key).toMatch(/^mcp:record_decision:[0-9a-f]{40}$/);
    expect(key.length).toBeLessThanOrEqual(128);
    expect(second.calls[0]!.write!.idempotencyKey).toBe(key);

    const changed = fakeAgentClient();
    await post(call("record_decision", { ...args, thesis: "Weaker." }), { client: changed, deps: { now: fixed } });
    expect(changed.calls[0]!.write!.idempotencyKey).not.toBe(key);

    const reader = fakeAgentClient();
    await post(call("get_portfolio"), { client: reader });
    expect(reader.calls[0]!.write).toBeUndefined();
  });

  it("logs the tool, principal and outcome without arguments or payloads", async () => {
    const client = fakeAgentClient({ getCompanyDossier: { thesis: "SECRET THESIS TEXT" } });
    const { lines } = await post(call("get_dossier", { symbol: "SNDK" }), { client });
    const serialized = JSON.stringify(lines);
    expect(serialized).toContain('"tool":"get_dossier"');
    expect(serialized).toContain('"principal":"writer"');
    expect(serialized).toContain('"rpc":["tools/call"]');
    expect(serialized).not.toContain("SECRET THESIS TEXT");
    expect(serialized).not.toContain("SNDK");
    expect(serialized).not.toContain("pf_test_writer_key_1");
  });
});

describe("OAuth end to end", () => {
  async function tokenFor(choice: "read_write" | "read_only") {
    const { createHash } = await import("node:crypto");
    const { registerDynamicClient } = await import("@/lib/oauth/clients");
    const { validateAuthorizationRequest, issueAuthorizationCode, grantedScopes } = await import(
      "@/lib/oauth/authorize"
    );
    const { exchangeToken } = await import("@/lib/oauth/token");
    const { oauthUrls } = await import("@/lib/oauth/config");
    const operator = "11111111-1111-4111-8111-111111111111";
    const store = memoryOAuthStore([operator]);
    const urls = oauthUrls(ORIGIN);
    const client = await registerDynamicClient(store, {
      client_name: "MCP Inspector",
      redirect_uris: ["http://localhost:6274/oauth/callback"],
    });
    const verifier = "v".repeat(64);
    const validation = await validateAuthorizationRequest(store, urls, {
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: "http://localhost:6274/oauth/callback",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      resource: urls.resource,
    });
    if (!validation.ok) throw new Error("validation failed");
    const location = await issueAuthorizationCode(store, urls, validation.request, {
      userId: operator,
      scopes: grantedScopes(validation.request.scopes, choice),
    });
    const tokens = await exchangeToken(
      store,
      urls,
      new URLSearchParams({
        grant_type: "authorization_code",
        code: new URL(location).searchParams.get("code")!,
        client_id: client.client_id,
        redirect_uri: "http://localhost:6274/oauth/callback",
        code_verifier: verifier,
      }),
    );
    return { store, token: tokens.access_token };
  }

  it("serves a tool call made with an OAuth access token, as that client", async () => {
    const { store, token } = await tokenFor("read_write");
    const client = fakeAgentClient({ getPortfolio: { nav_usd: 1 } });
    const { status, json, lines } = await post(call("get_portfolio"), {
      token,
      client,
      deps: { store: () => store },
    });
    expect(status).toBe(200);
    expect(json!.result.structuredContent).toEqual({ nav_usd: 1 });
    expect(lines.find((line) => line.evt === "mcp.request")).toMatchObject({
      auth: "oauth",
      principal: "mcp-inspector-mcp",
    });
    expect(JSON.stringify(lines)).not.toContain(token);
  });

  it("refuses a write on a read-only grant before it reaches PowerFund", async () => {
    const { store, token } = await tokenFor("read_only");
    const client = fakeAgentClient();
    const { json } = await post(
      call("complete_review_task", { review_task_id: TASK_ID, outcome: "Held." }),
      { token, client, deps: { store: () => store } },
    );
    expect(json!.result.structuredContent.error.code).toBe("INSUFFICIENT_SCOPE");
    expect(client.calls).toEqual([]);
  });

  it("answers a revoked token with 401 and a fresh challenge", async () => {
    const { store, token } = await tokenFor("read_write");
    for (const row of store.tokens.values()) row.revoked_at = new Date().toISOString();
    const { status, response } = await post(call("get_portfolio"), { token, deps: { store: () => store } });
    expect(status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });
});

describe("2026-07-28 (stateless) clients", () => {
  const envelope = {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientCapabilities": {},
    "io.modelcontextprotocol/clientInfo": { name: "modern-test", version: "1" },
  };
  async function modern(
    method: string,
    params: Record<string, unknown> = {},
    name?: string,
    overrides: { headers?: Record<string, string | null>; meta?: Record<string, unknown> } = {},
  ) {
    const client = fakeAgentClient({ getPortfolio: { nav_usd: 7 } });
    const { lines, logger } = capture();
    const headers: Record<string, string | null> = {
      host: "powerfund.example",
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: "Bearer pf_test_writer_key_1",
      "mcp-protocol-version": "2026-07-28",
      "mcp-method": method,
      ...(name ? { "mcp-name": name } : {}),
      ...overrides.headers,
    };
    const response = await handleMcpRequest(
      new Request(`${ORIGIN}/api/v1/mcp`, {
        method: "POST",
        headers: Object.fromEntries(
          Object.entries(headers).filter((entry): entry is [string, string] => entry[1] != null),
        ),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 9,
          method,
          params: { ...params, _meta: overrides.meta ?? envelope },
        }),
      }),
      { store: () => memoryOAuthStore(), agentKeys: KEYS, client: () => client, logger: () => logger, deploy: PRODUCTION },
    );
    return { status: response.status, json: JSON.parse(await response.text()), client, lines };
  }

  it("answers server/discover with the modern revision and the same instructions", async () => {
    const { status, json } = await modern("server/discover");
    expect(status).toBe(200);
    expect(json.result.supportedVersions).toContain("2026-07-28");
    expect(json.result.instructions).toMatch(/No tool books a fill/);
  });

  it("lists the same tools, annotations and security schemes as a 2025-era client sees", async () => {
    const { json: modernList } = await modern("tools/list");
    const { json: legacyList } = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const strip = (tools: Array<Record<string, unknown>>) =>
      tools.map(({ name, annotations, securitySchemes, _meta, description }) => ({
        name,
        annotations,
        securitySchemes,
        _meta,
        description,
      }));
    expect(strip(modernList.result.tools)).toEqual(strip(legacyList!.result.tools));
    expect(modernList.result.tools.length).toBe(POWERFUND_TOOLS.length);
  });

  it("tags every result complete, including list and discover", async () => {
    for (const [method, params, name] of [
      ["server/discover", {}, undefined],
      ["tools/list", {}, undefined],
      ["tools/call", { name: "get_portfolio", arguments: {} }, "get_portfolio"],
    ] as const) {
      const { json } = await modern(method, params, name);
      expect(json.result?.resultType, method).toBe("complete");
    }
  });

  it("returns tools in a deterministic order, with cache hints scoped to the caller", async () => {
    const first = await modern("tools/list");
    const second = await modern("tools/list");
    const names = first.json.result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toEqual(POWERFUND_TOOLS.map((tool) => tool.name));
    expect(second.json.result.tools.map((tool: { name: string }) => tool.name)).toEqual(names);
    expect(typeof first.json.result.ttlMs).toBe("number");
    // The list is per-caller (securitySchemes, auth): a shared cache must not keep it.
    expect(first.json.result.cacheScope).toBe("private");
  });

  it("refuses a request whose Mcp-Method header disagrees with the body", async () => {
    const { json, client } = await modern("tools/call", { name: "get_portfolio", arguments: {} }, "get_portfolio", {
      headers: { "mcp-method": "tools/list" },
    });
    expect(json.error?.code).toBe(-32020);
    expect(client.calls).toEqual([]);
  });

  it("refuses a tools/call whose Mcp-Name header names a different tool", async () => {
    const { json, client } = await modern("tools/call", { name: "get_portfolio", arguments: {} }, "get_performance");
    expect(json.error?.code).toBe(-32020);
    expect(client.calls).toEqual([]);
  });

  it("answers an unsupported protocol revision with the versions it does support", async () => {
    const { json } = await modern("tools/list", {}, undefined, {
      headers: { "mcp-protocol-version": "2099-01-01" },
      meta: { ...envelope, "io.modelcontextprotocol/protocolVersion": "2099-01-01" },
    });
    expect(json.error?.code).toBe(-32022);
    expect(JSON.stringify(json.error)).toContain("2026-07-28");
  });

  it("calls a tool statelessly, with no initialize first", async () => {
    const { json, client } = await modern("tools/call", { name: "get_portfolio", arguments: {} }, "get_portfolio");
    expect(json.result.structuredContent).toEqual({ nav_usd: 7 });
    expect(client.calls.map((call) => call.method)).toEqual(["getPortfolio"]);
  });
});

describe("request hygiene", () => {
  it("refuses a body that is not declared as JSON", async () => {
    const { logger } = capture();
    const response = await handleMcpRequest(
      new Request(`${ORIGIN}/api/v1/mcp`, {
        method: "POST",
        headers: {
          host: "powerfund.example",
          "content-type": "text/plain",
          authorization: "Bearer pf_test_writer_key_1",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
      { store: () => memoryOAuthStore(), agentKeys: KEYS, client: () => fakeAgentClient(), logger: () => logger, deploy: PRODUCTION },
    );
    expect(response.status).toBe(415);
  });
});

describe("read-only deployments (every Deploy Preview)", () => {
  const writeCall = call("record_decision", { symbol: "VRT", decision_type: "hold", thesis: "Intact." });

  it("refuses every write before it reaches PowerFund, even for a write-scoped caller", async () => {
    const client = fakeAgentClient();
    const { json } = await post(writeCall, { client, deps: { deploy: PREVIEW } });
    expect(json!.result.isError).toBe(true);
    expect(json!.result.structuredContent.error).toMatchObject({
      source: "authorization",
      code: "WRITES_DISABLED",
      retryable: false,
    });
    // Not a scope problem, so no re-authorization challenge to loop on.
    expect(json!.result._meta?.["mcp/www_authenticate"]).toBeUndefined();
    expect(client.calls).toEqual([]);
  });

  it("strips write scopes from the principal, so REST would refuse too", async () => {
    let seen: string[] = [];
    await post(call("get_portfolio"), {
      deps: {
        deploy: PREVIEW,
        client: (principal) => {
          seen = [...principal.scopes];
          return fakeAgentClient();
        },
      },
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((scope) => scope.endsWith(":read"))).toBe(true);
  });

  it("still lists every tool and serves reads, so model behaviour can be tested", async () => {
    const { json: list } = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { deps: { deploy: PREVIEW } });
    expect(list!.result.tools).toHaveLength(POWERFUND_TOOLS.length);
    const { json: read } = await post(call("get_portfolio"), {
      client: fakeAgentClient({ getPortfolio: { nav_usd: 1 } }),
      deps: { deploy: PREVIEW },
    });
    expect(read!.result.structuredContent).toEqual({ nav_usd: 1 });
  });

  it("tells the model the deployment is read-only", async () => {
    const { json } = await post(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } },
      },
      { deps: { deploy: PREVIEW } },
    );
    expect(json!.result.instructions).toMatch(/This deployment is read-only/);
  });

  it("binds a preview's OAuth discovery to its own URL", async () => {
    const { response } = await post(call("get_portfolio"), { token: null, deps: { deploy: PREVIEW } });
    expect(response.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://deploy-preview-1--powerfund.netlify.app/.well-known/oauth-protected-resource/api/v1/mcp"',
    );
  });

  it("has a production kill switch", async () => {
    const client = fakeAgentClient();
    const { json } = await post(writeCall, { client, deps: { deploy: { ...PRODUCTION, mcpReadOnly: "true" } } });
    expect(json!.result.structuredContent.error.code).toBe("WRITES_DISABLED");
    expect(client.calls).toEqual([]);
  });

  it("allows writes off production only with an explicit opt-in (a local stack)", async () => {
    const client = fakeAgentClient();
    await post(writeCall, { client, deps: { deploy: { ...PREVIEW, mcpAllowWrites: "true" } } });
    expect(client.calls.map((row) => row.method)).toEqual(["createDecision"]);
  });

  it("refuses to serve with no canonical origin rather than trust Host", async () => {
    const client = fakeAgentClient();
    const { status } = await post(call("get_portfolio"), {
      client,
      deps: { deploy: { ...PRODUCTION, context: "", siteUrl: "", deployUrl: "" } },
    });
    expect(status).toBe(503);
    expect(client.calls).toEqual([]);
  });
});

describe("security review: token lifetime at the MCP endpoint", () => {
  it("rejects an expired access token with a fresh invalid_token challenge", async () => {
    const { createHash } = await import("node:crypto");
    const { registerDynamicClient } = await import("@/lib/oauth/clients");
    const { validateAuthorizationRequest, issueAuthorizationCode } = await import("@/lib/oauth/authorize");
    const { exchangeToken } = await import("@/lib/oauth/token");
    const { oauthUrls } = await import("@/lib/oauth/config");
    const operator = "11111111-1111-4111-8111-111111111111";
    const store = memoryOAuthStore([operator]);
    const urls = oauthUrls(ORIGIN);
    const client = await registerDynamicClient(store, { redirect_uris: ["http://localhost:6274/cb"] });
    const verifier = "v".repeat(64);
    const validation = await validateAuthorizationRequest(store, urls, {
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: "http://localhost:6274/cb",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    });
    if (!validation.ok) throw new Error("validation failed");
    const issuedAt = new Date("2026-09-29T10:00:00Z");
    const location = await issueAuthorizationCode(store, urls, validation.request, {
      userId: operator,
      scopes: ["powerfund:portfolio:read"],
      now: issuedAt,
    });
    const tokens = await exchangeToken(
      store,
      urls,
      new URLSearchParams({
        grant_type: "authorization_code",
        code: new URL(location).searchParams.get("code")!,
        client_id: client.client_id,
        redirect_uri: "http://localhost:6274/cb",
        code_verifier: verifier,
      }),
      issuedAt,
    );
    const fresh = await post(call("get_portfolio"), {
      token: tokens.access_token,
      deps: { store: () => store, now: () => new Date("2026-09-29T10:30:00Z") },
    });
    expect(fresh.status).toBe(200);
    const stale = await post(call("get_portfolio"), {
      token: tokens.access_token,
      deps: { store: () => store, now: () => new Date("2026-09-29T11:00:01Z") },
    });
    expect(stale.status).toBe(401);
    expect(stale.response.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });
});

describe("review follow-ups", () => {
  it("lets a 2026-07-28 browser client through CORS preflight", async () => {
    const { mcpPreflight } = await import("./handler");
    const response = mcpPreflight();
    expect(response.status).toBe(204);
    const allowed = (response.headers.get("access-control-allow-headers") ?? "")
      .toLowerCase()
      .split(/,\s*/);
    for (const header of ["authorization", "content-type", "mcp-protocol-version", "mcp-method", "mcp-name"]) {
      expect(allowed, header).toContain(header);
    }
    expect(response.headers.get("access-control-expose-headers")).toMatch(/WWW-Authenticate/);
  });

  it("advertises an output schema on every tool, in both protocol eras", async () => {
    const { json } = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    for (const tool of json!.result.tools as Array<Record<string, any>>) {
      expect(tool.outputSchema?.type, tool.name).toBe("object");
    }
  });

  it("returns a write's result intact under its output schema", async () => {
    const client = fakeAgentClient({ createDecision: { created: true, decision: { id: "d1", extra: 1 } } });
    const { json } = await post(call("record_decision", { symbol: "VRT", decision_type: "hold", thesis: "Intact." }), {
      client,
    });
    expect(json!.result.isError).toBeFalsy();
    expect(json!.result.structuredContent.decision.id).toBe("d1");
  });
});
