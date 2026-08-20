import { AGENT_API_VERSION } from "./http";
import { AGENT_SCOPES, READ_SCOPES, WRITE_SCOPES } from "./scopes";

const errorResponse = {
  description: "Structured agent error",
  content: {
    "application/json": {
      schema: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string" },
              message: { type: "string" },
            },
            additionalProperties: true,
          },
        },
      },
    },
  },
};

function op(
  args: {
    operationId: string;
    summary: string;
    description: string;
    scope: string;
    mutating: boolean;
    createsDossierVersion?: boolean;
    pinsDecisionVersion?: boolean;
    parameters?: unknown[];
    requestBody?: unknown;
    responses?: Record<string, unknown>;
  },
) {
  return {
    operationId: args.operationId,
    summary: args.summary,
    description: [
      args.description,
      `Read-only: ${!args.mutating}.`,
      `Required scope: ${args.scope}.`,
      args.createsDossierVersion
        ? "May create a new immutable dossier_versions row if the assembled snapshot changed."
        : "Does not create a dossier version.",
      args.pinsDecisionVersion
        ? "A created decision is permanently pinned to the current dossier_version_id."
        : "Does not pin a journal decision to a dossier version.",
    ].join(" "),
    tags: ["agent"],
    security: [{ bearerAuth: [] }],
    "x-powerfund-scope": args.scope,
    "x-powerfund-mutating": args.mutating,
    parameters: args.parameters,
    requestBody: args.requestBody,
    responses: {
      "200": { description: "OK" },
      "401": errorResponse,
      "403": errorResponse,
      ...(args.responses ?? {}),
    },
  };
}

export function agentOpenApiDocument(origin: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Power Fund agent API",
      version: AGENT_API_VERSION,
      description:
        "Private authenticated domain API for AI agents. " +
        "This is not table CRUD and not trade execution. " +
        "Agents may read fund state, update dossiers (which version automatically), " +
        "append journal decisions, propose deployment-queue items, and manage a separate review queue. " +
        "Humans remain responsible for booking fills. " +
        "A review trigger never creates a transaction. " +
        "Authenticate with Authorization: Bearer <agent token>. " +
        "Send Idempotency-Key on POST /decisions, POST /planned-actions, POST /review-tasks, and POST /review-tasks/{id}/complete.",
    },
    servers: [{ url: origin }],
    tags: [
      {
        name: "agent",
        description: "Constrained investment-state operations",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "Agent API key from POWERFUND_AGENT_API_KEYS. Scopes: " +
            AGENT_SCOPES.join(", ") +
            `. Read role grants ${READ_SCOPES.join(", ")}. Write role adds ${WRITE_SCOPES.filter((scope) => !READ_SCOPES.includes(scope)).join(", ")}.`,
        },
      },
    },
    paths: {
      "/api/v1/agent": {
        get: op({
          operationId: "getAgentIndex",
          summary: "Agent API index",
          description: "Lists private operations and how they map to MCP tools later.",
          scope: "powerfund:state:read",
          mutating: false,
        }),
      },
      "/api/v1/agent/openapi.json": {
        get: op({
          operationId: "getAgentOpenApi",
          summary: "Agent OpenAPI document",
          description: "Machine-readable schema for this private API, written for tool-using agents.",
          scope: "powerfund:state:read",
          mutating: false,
        }),
      },
      "/api/v1/agent/state": {
        get: op({
          operationId: "getFundState",
          summary: "Current investment state snapshot",
          description:
            "High-leverage read of mandate, cash, holdings, theme exposure, open deployment queue, due and upcoming reviews, recent decisions, and current dossier version pointers. Does not return full historical dossiers or the full journal.",
          scope: "powerfund:state:read",
          mutating: false,
          parameters: [
            {
              name: "recent_decisions",
              in: "query",
              schema: { type: "integer", default: 20, maximum: 50 },
            },
            {
              name: "include_watchlist",
              in: "query",
              schema: { type: "boolean", default: true },
            },
          ],
        }),
      },
      "/api/v1/agent/portfolio": {
        get: op({
          operationId: "getPortfolio",
          summary: "Private portfolio book",
          description:
            "Full private book derived from the transactions ledger: NAV, cash, quantities, average cost, market value, weights, realised and unrealised P&L, theme allocations, and compact performance vs SPY/QQQ. Not a second source of truth for positions.",
          scope: "powerfund:portfolio:read",
          mutating: false,
        }),
      },
      "/api/v1/agent/journal": {
        get: op({
          operationId: "getJournal",
          summary: "Investment journal",
          description:
            "Reads decisions. Each entry includes the pinned dossier_version id/number when one exists. Use getDossierVersion to load the snapshot believed at decision time.",
          scope: "powerfund:journal:read",
          mutating: false,
          parameters: [
            { name: "symbol", in: "query", schema: { type: "string" } },
            { name: "decision_type", in: "query", schema: { type: "string" } },
            { name: "date_from", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "date_to", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 100 } },
            { name: "before", in: "query", schema: { type: "string", format: "date-time" } },
          ],
        }),
      },
      "/api/v1/agent/deployment-queue": {
        get: op({
          operationId: "getPlannedActions",
          summary: "Open deployment queue",
          description:
            "Pending and deferred planned_actions plus mandate-after-fill flags. This is intention, not execution.",
          scope: "powerfund:deployment:read",
          mutating: false,
        }),
      },
      "/api/v1/agent/companies/{symbol}": {
        get: op({
          operationId: "getCompanyDossier",
          summary: "Current company research object",
          description:
            "Instrument metadata, live dossier fields, and the current dossier version id/number.",
          scope: "powerfund:dossier:read",
          mutating: false,
          parameters: [
            { name: "symbol", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { "404": errorResponse },
        }),
      },
      "/api/v1/agent/companies/{symbol}/versions": {
        get: op({
          operationId: "getDossierVersions",
          summary: "Dossier version history",
          description: "Immutable snapshot headers for a company. Does not include full snapshot bodies.",
          scope: "powerfund:dossier:read",
          mutating: false,
          parameters: [
            { name: "symbol", in: "path", required: true, schema: { type: "string" } },
          ],
        }),
      },
      "/api/v1/agent/companies/{symbol}/versions/{version}": {
        get: op({
          operationId: "getDossierVersion",
          summary: "One immutable dossier snapshot",
          description:
            "Returns the assembled JSON believed at that version. Use this to answer what we believed when a decision was made.",
          scope: "powerfund:dossier:read",
          mutating: false,
          parameters: [
            { name: "symbol", in: "path", required: true, schema: { type: "string" } },
            {
              name: "version",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "version_number or version UUID",
            },
          ],
        }),
      },
      "/api/v1/agent/companies/{symbol}/dossier": {
        patch: op({
          operationId: "updateDossier",
          summary: "Update the live dossier",
          description:
            "Single domain operation: write the mutable dossiers row and, in the same transaction, create the next dossier_versions snapshot only if the assembled JSON changed. Rejects stale expected_version with 409. Do not PATCH dossiers and POST dossier_versions separately.",
          scope: "powerfund:dossier:write",
          mutating: true,
          createsDossierVersion: true,
          parameters: [
            { name: "symbol", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["change_reason", "changes"],
                  properties: {
                    expected_version: { type: "integer" },
                    change_reason: { type: "string" },
                    actor: { type: "string" },
                    actor_name: { type: "string" },
                    research_sources: {
                      type: "array",
                      items: { type: "string" },
                    },
                    changes: { type: "object" },
                  },
                },
              },
            },
          },
          responses: {
            "409": errorResponse,
            "422": errorResponse,
          },
        }),
      },
      "/api/v1/agent/decisions": {
        post: op({
          operationId: "createDecision",
          summary: "Append a journal decision",
          description:
            "Creates a decisions row using existing decision_type values. Automatically pins dossier_version_id to the current version. The client must not supply dossier_version_id. Idempotent when Idempotency-Key is sent.",
          scope: "powerfund:journal:append",
          mutating: true,
          pinsDecisionVersion: true,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["symbol", "decision_type", "thesis"],
                  properties: {
                    symbol: { type: "string" },
                    decision_type: {
                      type: "string",
                      enum: ["enter", "add", "reduce", "exit", "hold", "watch"],
                    },
                    thesis: { type: "string" },
                    catalysts: { type: "string" },
                    risks: { type: "string" },
                    invalidation: { type: "string" },
                    sizing_rationale: { type: "string" },
                    action_at: { type: "string", format: "date-time" },
                    actor_name: { type: "string" },
                  },
                },
              },
            },
          },
        }),
      },
      "/api/v1/agent/planned-actions": {
        post: op({
          operationId: "createPlannedAction",
          summary: "Propose a deployment-queue item",
          description:
            "Inserts a pending planned_action. Maps onto existing fields (action_type, planned_usd, window_label, due_by, rationale). Optional target_weight_pct is converted to planned_usd using current NAV. Does not insert transactions or book a fill. Idempotent when Idempotency-Key is sent.",
          scope: "powerfund:deployment:write",
          mutating: true,
        }),
      },
      "/api/v1/agent/planned-actions/{id}": {
        patch: op({
          operationId: "updatePlannedAction",
          summary: "Update a queued planned action",
          description:
            "Updates an open planned_action. Status may be pending, deferred, or cancelled. Confirming a fill is forbidden — humans book fills in the UI.",
          scope: "powerfund:deployment:write",
          mutating: true,
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "404": errorResponse,
            "422": errorResponse,
          },
        }),
      },
      "/api/v1/agent/review-queue": {
        get: op({
          operationId: "getReviewQueue",
          summary: "Review obligation queue",
          description:
            "Lists review_tasks, distinct from planned_actions. Evaluates pending triggers first (scheduled, event_window, and evaluable price conditions) and marks satisfied tasks due. Evaluation never writes transactions. Pass evaluate=false to skip. Filter with status=due|pending|in_progress|completed|deferred|cancelled|open|all.",
          scope: "powerfund:reviews:read",
          mutating: false,
          parameters: [
            { name: "status", in: "query", schema: { type: "string" } },
            {
              name: "evaluate",
              in: "query",
              schema: { type: "boolean", default: true },
            },
          ],
        }),
      },
      "/api/v1/agent/review-tasks": {
        post: op({
          operationId: "createReviewTask",
          summary: "Create a review obligation",
          description:
            "Inserts a pending review_task with a declarative trigger (scheduled, event_window, or condition). Resolves symbols and theme slugs to foreign keys. Does not create planned_actions or transactions. Idempotent when Idempotency-Key is sent.",
          scope: "powerfund:reviews:write",
          mutating: true,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["title", "instructions", "scope", "trigger"],
                  properties: {
                    title: { type: "string" },
                    instructions: { type: "string" },
                    scope: {
                      type: "string",
                      enum: ["company", "theme", "portfolio", "macro"],
                    },
                    priority: {
                      type: "string",
                      enum: ["low", "normal", "high", "urgent"],
                    },
                    symbols: { type: "array", items: { type: "string" } },
                    themes: { type: "array", items: { type: "string" } },
                    trigger: { type: "object" },
                  },
                },
              },
            },
          },
        }),
      },
      "/api/v1/agent/review-tasks/{id}": {
        patch: op({
          operationId: "updateReviewTask",
          summary: "Update a review obligation",
          description:
            "Updates an open review_task. Status may be pending, in_progress, deferred, or cancelled. Cannot set due (triggers do that) or completed (use completeReviewTask).",
          scope: "powerfund:reviews:write",
          mutating: true,
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "404": errorResponse,
            "422": errorResponse,
          },
        }),
      },
      "/api/v1/agent/review-tasks/{id}/complete": {
        post: op({
          operationId: "completeReviewTask",
          summary: "Complete a review obligation",
          description:
            "Records outcome and optional links to existing dossier_version, decision, or planned_action ids. Does not update dossiers, create decisions, create planned actions, or book fills. Idempotent when Idempotency-Key is sent.",
          scope: "powerfund:reviews:write",
          mutating: true,
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["outcome"],
                  properties: {
                    outcome: { type: "string" },
                    outputs: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["kind", "entity_id"],
                        properties: {
                          kind: {
                            type: "string",
                            enum: ["dossier_version", "decision", "planned_action"],
                          },
                          entity_id: { type: "string", format: "uuid" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      },
    },
  };
}
