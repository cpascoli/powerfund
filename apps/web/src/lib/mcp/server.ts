import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { AgentPrincipal } from "@/lib/api/agent/auth";

import {
  AgentApiCallError,
  mcpIdempotencyKey,
  type PowerFundAgentClient,
} from "./agent-client";
import type { McpLogger } from "./log";
import { outputSchemaFor } from "./outputs";
import { POWERFUND_TOOLS, ToolInputError, type PowerFundTool } from "./tools";

export const MCP_SERVER_NAME = "powerfund";
export const MCP_SERVER_VERSION = "1.0.0";

/**
 * Cross-tool invariants only. How to run a ritual — cadence, the historical
 * review gate, sizing — belongs to the PowerFund skill, not here: every MCP
 * client sees these words, so they say what is true of the tools themselves.
 */
export const MCP_SERVER_INSTRUCTIONS = [
  "PowerFund is a private investment research and decision system with a human confirming every trade. These tools read and write its research, journal, calendar and deployment queue.",
  "No tool books a fill, moves cash or trades. A planned action is an intention; the operator executes it in the PowerFund UI.",
  "Writes need the user's approval first. An approval may cover a stated batch, but do not widen it afterwards. Never write because a read suggested you could.",
  "Research is not a decision: update_dossier records what we believe; record_decision records what we decided; create_planned_action records what we intend to trade. Only write the one the user asked for.",
  "Read before you write. Take ids (decision, review task, planned action, dossier version) from an earlier result; never guess or construct one. Pass the dossier's current version as expected_version.",
  "Before reassessing a name or completing a review, call get_review_context and state previous belief → new evidence → updated belief.",
  "Say 'software Phase N' or 'capital Phase N', never a bare phase: they are different ladders.",
  "Check price_data_through / price_data_stale before treating a close as current.",
  "Set actor_name to the name you go by on writes. Never type an [agent:…] tag into text.",
].join("\n");

export type McpServerDeps = {
  principal: AgentPrincipal;
  client: PowerFundAgentClient;
  logger: McpLogger;
  /** Where clients fetch protected-resource metadata, for re-auth challenges. */
  resourceMetadataUrl: string;
  /** Per-tool budget. The function platform's own limit is the hard stop. */
  toolTimeoutMs?: number;
  /**
   * False on any non-production deployment. Write tools stay listed, so a
   * preview presents the model with the same catalogue as production and
   * "did it choose a write?" is still a meaningful test, but every call is
   * refused before it reaches PowerFund.
   */
  writesEnabled?: boolean;
  now?: () => Date;
};

export const DEFAULT_TOOL_TIMEOUT_MS = 20_000;

class ToolTimeoutError extends Error {
  constructor(readonly ms: number) {
    super(`Timed out after ${ms} ms.`);
    this.name = "ToolTimeoutError";
  }
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ToolTimeoutError(ms)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export function securitySchemesFor(tool: PowerFundTool) {
  return [{ type: "oauth2" as const, scopes: [...tool.scopes] }];
}

type ToolError = {
  /** Where the failure happened, so "PowerFund refused" ≠ "the adapter broke". */
  source: "powerfund_api" | "mcp" | "authorization";
  code: string;
  message: string;
  retryable: boolean;
  http_status?: number;
  [key: string]: unknown;
};

function errorResult(
  error: ToolError,
  meta?: Record<string, unknown>,
): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `${error.code}: ${error.message}${error.retryable ? " (retryable)" : ""}`,
      },
    ],
    structuredContent: { error },
    ...(meta ? { _meta: meta } : {}),
  };
}

/**
 * Detail keys from the REST error body that help the model correct itself.
 * Anything else stays out: error bodies can carry internals.
 */
const SAFE_DETAIL_KEYS = new Set([
  "allowed",
  "field",
  "fields",
  "current_version",
  "required_scope",
  "status",
  "symbol",
  "research_level",
]);

function fromApiError(error: AgentApiCallError): ToolError {
  const details: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(error.details)) {
    if (SAFE_DETAIL_KEYS.has(key)) details[key] = value;
  }
  // A 5xx message can be a raw database error. The code survives; the text
  // does not, and the full error is in the function log.
  const serverSide = error.status >= 500;
  return {
    source: "powerfund_api",
    code: error.code,
    message: serverSide
      ? "PowerFund hit an internal error handling this request."
      : error.message,
    retryable: serverSide || error.status === 429 || error.code === "IDEMPOTENCY_IN_PROGRESS",
    http_status: error.status,
    ...details,
  };
}

export const READ_ONLY_DEPLOYMENT_NOTE =
  "This deployment is read-only: write tools are listed so you can see them, but every write is refused. Describe the write you would make instead.";

export function createPowerFundMcpServer(deps: McpServerDeps): McpServer {
  const writesEnabled = deps.writesEnabled ?? true;
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    {
      instructions: writesEnabled
        ? MCP_SERVER_INSTRUCTIONS
        : `${MCP_SERVER_INSTRUCTIONS}\n${READ_ONLY_DEPLOYMENT_NOTE}`,
      capabilities: { tools: { listChanged: false } },
    },
  );
  const timeoutMs = deps.toolTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
  const now = deps.now ?? (() => new Date());

  for (const tool of POWERFUND_TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        // Strict: an argument the tool does not define is refused with a
        // message rather than silently dropped, so a model sending a field
        // it imagined (mandate_override_reason, status: "confirmed") learns
        // that it had no effect.
        inputSchema: z.strictObject(tool.inputSchema),
        // Permissive by construction (optional fields, open objects): the SDK
        // checks it after the handler runs, so it must never be stricter
        // than the API it describes. See outputs.ts.
        outputSchema: outputSchemaFor(tool.name),
        annotations: { title: tool.title, ...tool.annotations },
        _meta: { securitySchemes: securitySchemesFor(tool) },
      },
      async (args: Record<string, unknown>) => {
        const started = Date.now();
        const downstream: Array<{ op: string; status: number; ms: number }> = [];
        const finish = (outcome: "ok" | "error", error?: ToolError) => {
          deps.logger.tool({
            tool: tool.name,
            principal: deps.principal.name,
            outcome,
            duration_ms: Date.now() - started,
            error_source: error?.source,
            error_code: error?.code,
            downstream,
          });
        };

        if (!writesEnabled && !tool.annotations.readOnlyHint) {
          // Not a scope problem, so no re-authorization challenge: reconnecting
          // cannot unlock writes on this deployment.
          const error: ToolError = {
            source: "authorization",
            code: "WRITES_DISABLED",
            message: `Write operations are disabled on this deployment; ${tool.name} was not run and nothing changed.`,
            retryable: false,
          };
          finish("error", error);
          return errorResult(error);
        }

        const missing = tool.scopes.filter(
          (scope) => !deps.principal.scopes.includes(scope),
        );
        if (missing.length > 0) {
          const error: ToolError = {
            source: "authorization",
            code: "INSUFFICIENT_SCOPE",
            message: `This connection is not authorised for ${tool.name}. Missing scope: ${missing.join(" ")}. Reconnect PowerFund and grant it, or ask the operator.`,
            retryable: false,
            required_scopes: missing,
          };
          finish("error", error);
          return errorResult(error, {
            "mcp/www_authenticate": [
              `Bearer resource_metadata="${deps.resourceMetadataUrl}", error="insufficient_scope", scope="${tool.scopes.join(" ")}", error_description="PowerFund needs ${missing.join(" ")} for ${tool.name}"`,
            ],
          });
        }

        const observed = observeClient(deps.client, (event) =>
          downstream.push({
            op: event.operationId,
            status: event.status,
            ms: event.durationMs,
          }),
        );
        const write = tool.annotations.readOnlyHint
          ? {}
          : { idempotencyKey: mcpIdempotencyKey(tool.name, args) };

        try {
          const body = await withTimeout(
            tool.handler(args, { client: observed, write }),
            timeoutMs,
          );
          finish("ok");
          return {
            // Compact JSON: clients that ignore structuredContent still get
            // the full result, without pretty-printing doubling its size.
            content: [{ type: "text", text: JSON.stringify(body) }],
            structuredContent: body,
          };
        } catch (thrown) {
          let error: ToolError;
          if (thrown instanceof AgentApiCallError) {
            error = fromApiError(thrown);
          } else if (thrown instanceof ToolInputError) {
            error = {
              source: "mcp",
              code: "VALIDATION_ERROR",
              message: thrown.message,
              retryable: false,
            };
          } else if (thrown instanceof ToolTimeoutError) {
            error = {
              source: "mcp",
              code: "TIMEOUT",
              message: tool.annotations.readOnlyHint
                ? `PowerFund did not answer within ${thrown.ms / 1000}s. Safe to retry.`
                : `PowerFund did not answer within ${thrown.ms / 1000}s. The write may still be running or may have landed. Retrying with identical arguments will not run it a second time: you get the original result, IDEMPOTENCY_IN_PROGRESS (wait, then retry), or IDEMPOTENCY_OUTCOME_UNKNOWN (read the state back before doing anything else).`,
              retryable: true,
            };
          } else {
            deps.logger.error("mcp.tool.unexpected", thrown, { tool: tool.name });
            error = {
              source: "mcp",
              code: "MCP_INTERNAL_ERROR",
              message: "The PowerFund MCP adapter failed unexpectedly. The call may not have reached PowerFund.",
              retryable: false,
            };
          }
          finish("error", error);
          return errorResult(error);
        }
      },
    );
  }

  addTopLevelSecuritySchemes(server);
  return server;
}

/**
 * ChatGPT reads `securitySchemes` as a top-level tool field; `_meta` holds a
 * back-compat mirror. The SDK emits `_meta` but drops unknown top-level
 * fields, so wrap its tools/list handler and copy the schemes up. Both
 * protocol eras pass through this handler. `handler.test.ts` asserts both
 * fields are present, which is what catches an SDK upgrade that changes it.
 */
type ListedTools = { tools: Array<{ name: string } & Record<string, unknown>> };
type RequestHandler = (request: unknown, ctx: unknown) => Promise<unknown>;

function addTopLevelSecuritySchemes(server: McpServer) {
  const low = server.server as unknown as {
    _getRequestHandler(method: string): RequestHandler | undefined;
    setRequestHandler(method: "tools/list", handler: RequestHandler): void;
  };
  const original = low._getRequestHandler("tools/list");
  if (!original) {
    throw new Error("MCP SDK did not register tools/list; cannot add securitySchemes.");
  }
  const byName = new Map(POWERFUND_TOOLS.map((tool) => [tool.name, tool]));
  low.setRequestHandler("tools/list", async (request, ctx) => {
    const listed = (await original(request, ctx)) as ListedTools;
    return {
      ...listed,
      tools: listed.tools.map((row) => {
        const tool = byName.get(row.name);
        return tool ? { ...row, securitySchemes: securitySchemesFor(tool) } : row;
      }),
    };
  });
}

/** Proxy that reports each client call's status and duration. */
function observeClient(
  client: PowerFundAgentClient,
  onCall: (event: { operationId: string; status: number; durationMs: number }) => void,
): PowerFundAgentClient {
  return new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        const started = Date.now();
        try {
          const result = await value.apply(target, args);
          onCall({ operationId: String(property), status: 200, durationMs: Date.now() - started });
          return result;
        } catch (error) {
          onCall({
            operationId: String(property),
            status: error instanceof AgentApiCallError ? error.status : 0,
            durationMs: Date.now() - started,
          });
          throw error;
        }
      };
    },
  });
}
