import { AGENT_API_VERSION } from "./http";
import { AGENT_SCOPES, READ_SCOPES, WRITE_SCOPES } from "./scopes";

/** GPT Actions truncate endpoint summary/description at 300 characters. */
export const GPT_ACTION_TEXT_MAX = 300;

const jsonObjectSchema = {
  type: "object",
  properties: {},
  additionalProperties: true,
};

const jsonOk = {
  description: "OK",
  content: {
    "application/json": {
      schema: jsonObjectSchema,
    },
  },
};

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

const symbolParam = {
  name: "symbol",
  in: "path",
  required: true,
  schema: { type: "string" },
  description: "Ticker symbol, for example MRCY.",
};

const uuidParam = (name: string, description: string) => ({
  name,
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
  description,
});

/**
 * Flattened trigger schema. GPT Actions do not support oneOf/anyOf, so every
 * field is listed and the description says which are required for each type.
 */
const reviewTriggerSchema = {
  type: "object",
  description:
    "When type=scheduled, send at (ISO datetime). Do not send scheduled_for. " +
    "When type=event_window, send not_before and due_by. " +
    "When type=condition, send metric, symbol, operator, and value. " +
    "lookback_days is required if metric=price_return_pct. " +
    "Auto-evaluated metrics: price, price_return_pct. A trigger never creates a trade.",
  required: ["type"],
  properties: {
    type: {
      type: "string",
      enum: ["scheduled", "event_window", "condition"],
      description: "Trigger kind.",
    },
    at: {
      type: "string",
      format: "date-time",
      description:
        "Required for type=scheduled. UTC instant when the review becomes due.",
    },
    not_before: {
      type: "string",
      format: "date-time",
      description:
        "Required for type=event_window. Window opens; the task becomes due then.",
    },
    due_by: {
      type: "string",
      format: "date-time",
      description:
        "Required for type=event_window. Deadline after not_before. Stays due after this time.",
    },
    metric: {
      type: "string",
      description:
        "Required for type=condition. Use price or price_return_pct for auto-due. Other names stay pending.",
    },
    symbol: {
      type: "string",
      description: "Required for type=condition. Ticker such as MRCY.",
    },
    operator: {
      type: "string",
      enum: ["lt", "lte", "gt", "gte", "eq"],
      description: "Required for type=condition.",
    },
    value: {
      type: "number",
      description: "Required for type=condition. Threshold compared to the metric.",
    },
    lookback_days: {
      type: "integer",
      minimum: 1,
      description: "Required when metric=price_return_pct.",
    },
  },
  example: {
    type: "scheduled",
    at: "2026-08-22T00:00:00Z",
  },
};

const reviewTaskSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    instructions: { type: "string" },
    scope: { type: "string" },
    priority: { type: "string" },
    status: { type: "string" },
    trigger: reviewTriggerSchema,
    evaluable: { type: "boolean" },
    symbols: { type: "array", items: { type: "string" } },
    themes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          slug: { type: "string" },
          name: { type: "string" },
        },
      },
    },
    scheduled_for: { type: "string", format: "date-time" },
    not_before: { type: "string", format: "date-time" },
    due_by: { type: "string", format: "date-time" },
    became_due_at: { type: "string", format: "date-time" },
    created_at: { type: "string", format: "date-time" },
    created_by: { type: "string" },
    completed_at: { type: "string", format: "date-time" },
    outcome: { type: "string" },
    outputs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string" },
          entity_id: { type: "string" },
        },
      },
    },
  },
};

function jsonOkBody(schema: Record<string, unknown>) {
  return {
    description: "OK",
    content: {
      "application/json": { schema },
    },
  };
}

const createReviewTaskOk = jsonOkBody({
  type: "object",
  properties: {
    created: { type: "boolean" },
    review_task: reviewTaskSchema,
  },
});

const updateReviewTaskOk = jsonOkBody({
  type: "object",
  properties: {
    updated: { type: "boolean" },
    review_task: reviewTaskSchema,
  },
});

const completeReviewTaskOk = jsonOkBody({
  type: "object",
  properties: {
    completed: { type: "boolean" },
    review_task: reviewTaskSchema,
  },
});

const reviewQueueOk = jsonOkBody({
  type: "object",
  properties: {
    as_of: { type: "string", format: "date-time" },
    marked_due: { type: "integer" },
    filter: {
      type: "object",
      description: "The filter actually applied, echoed back.",
      properties: {
        status: { type: "string" },
        scope: { type: "string" },
        symbols: { type: "array", items: { type: "string" } },
        themes: { type: "array", items: { type: "string" } },
        completed_since: { type: "string" },
        completed_before: { type: "string" },
        limit: { type: "integer" },
        order: { type: "string" },
      },
    },
    returned: { type: "integer" },
    truncated: {
      type: "boolean",
      description:
        "More rows match than were returned. Raise limit or narrow the filter — a truncated history is a partial chain of reasoning.",
    },
    tasks: { type: "array", items: reviewTaskSchema },
  },
});

const watchlistCompanySchema = {
  type: "object",
  properties: {
    symbol: { type: "string" },
    name: { type: "string" },
    status: { type: "string" },
    asset_class: { type: "string" },
    exchange: { type: "string" },
    notes: { type: "string" },
    theme: {
      type: "object",
      properties: {
        slug: { type: "string" },
        name: { type: "string" },
      },
    },
    has_dossier: { type: "boolean" },
  },
};

const addWatchlistCompanyOk = jsonOkBody({
  type: "object",
  properties: {
    created: { type: "boolean" },
    company: watchlistCompanySchema,
  },
});

const decisionOutcomeSchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    decision_id: { type: "string", format: "uuid" },
    recorded_at: { type: "string", format: "date-time" },
    thesis_grade: {
      type: "string",
      enum: ["correct", "partly_correct", "wrong"],
    },
    timing_grade: { type: "string", enum: ["good", "mixed", "poor"] },
    sizing_grade: { type: "string", enum: ["good", "mixed", "poor"] },
    risk_management_grade: { type: "string", enum: ["good", "mixed", "poor"] },
    lessons: { type: "string" },
    actor_name: { type: "string" },
  },
};

const recordDecisionOutcomeOk = jsonOkBody({
  type: "object",
  properties: {
    recorded: { type: "boolean" },
    outcome: decisionOutcomeSchema,
  },
});

const dossierChangesSchema = {
  type: "object",
  description: "Fields to change on the live dossier. Omit unchanged fields.",
  properties: {
    status: {
      type: "string",
      enum: ["watch", "investigate", "active_thesis", "passed"],
    },
    research_level: {
      type: "string",
      enum: ["draft", "screened", "primary_verified", "investment_ready"],
    },
    summary: { type: "string" },
    thesis: { type: "string" },
    catalysts: { type: "string" },
    risks: { type: "string" },
    invalidation: { type: "string" },
    competitive_notes: { type: "string" },
    next_diligence: { type: "string" },
    source: { type: "string" },
    as_of_at: { type: "string", format: "date-time" },
    verified_at: { type: "string", format: "date-time" },
    next_review_at: { type: "string", format: "date-time" },
  },
};

function op(args: {
  operationId: string;
  summary: string;
  description: string;
  scope: string;
  mutating: boolean;
  parameters?: unknown[];
  requestBody?: unknown;
  responses?: Record<string, unknown>;
}) {
  if (args.summary.length > GPT_ACTION_TEXT_MAX) {
    throw new Error(`OpenAPI summary too long for GPT Actions: ${args.operationId}`);
  }
  if (args.description.length > GPT_ACTION_TEXT_MAX) {
    throw new Error(
      `OpenAPI description too long for GPT Actions: ${args.operationId}`,
    );
  }
  return {
    operationId: args.operationId,
    summary: args.summary,
    description: args.description,
    tags: ["agent"],
    security: [{ bearerAuth: [] }],
    "x-powerfund-scope": args.scope,
    "x-openai-isConsequential": args.mutating,
    parameters: args.parameters,
    requestBody: args.requestBody,
    responses: {
      "200": jsonOk,
      "401": errorResponse,
      "403": errorResponse,
      "500": errorResponse,
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
        "Private Power Fund actions for ChatGPT. Read the book, add watchlist names, " +
        "update dossiers, append journal decisions, queue intended trades, and create review obligations. " +
        "Not table CRUD and not trade execution. Humans book fills. " +
        "Auth: API key as Bearer token (configured in the GPT). " +
        `Scopes: ${AGENT_SCOPES.join(", ")}. ` +
        `Read role: ${READ_SCOPES.join(", ")}. ` +
        `Write role adds ${WRITE_SCOPES.filter((scope) => !READ_SCOPES.includes(scope)).join(", ")}.`,
    },
    servers: [{ url: origin }],
    tags: [
      {
        name: "agent",
        description: "Investment-state operations. Reviews are not trades.",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API Key",
          description: "Agent token from POWERFUND_AGENT_API_KEYS.",
        },
      },
      schemas: {
        JsonObject: jsonObjectSchema,
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      "/api/v1/agent/state": {
        get: op({
          operationId: "getFundState",
          summary: "Current investment state",
          description:
            "Start here. Returns mandate, cash, holdings, planned trades, due and upcoming reviews, recent decisions, and current dossier version pointers.",
          scope: "powerfund:state:read",
          mutating: false,
          parameters: [
            {
              name: "recent_decisions",
              in: "query",
              description: "How many recent journal rows to include. Default 20, max 50.",
              schema: { type: "integer", default: 20, maximum: 50 },
            },
            {
              name: "include_watchlist",
              in: "query",
              description: "If true, include the research universe and themes. Default true.",
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
            "Ledger-derived book: NAV, cash, quantities, cost, last_close plus last_close_session. Flags include the kill-switch diagnostic. TWR is getPerformance. *_pct are percent.",
          scope: "powerfund:portfolio:read",
          mutating: false,
        }),
      },
      "/api/v1/agent/performance": {
        get: op({
          operationId: "getPerformance",
          summary: "NAV and deployed performance",
          description:
            "NAV and deployed TWR vs SPY/QQQ, unitized drawdowns, and dollar contribution by ticker, theme, and factor. Optional from/to as YYYY-MM-DD. Returns are percent. price_data_through is the last session, not as_of.",
          scope: "powerfund:portfolio:read",
          mutating: false,
          parameters: [
            {
              name: "from",
              in: "query",
              description: "Inclusive start date YYYY-MM-DD. Omit for since-inception windows.",
              schema: { type: "string", format: "date" },
            },
            {
              name: "to",
              in: "query",
              description: "Inclusive end date YYYY-MM-DD. Omit to include today's live mark.",
              schema: { type: "string", format: "date" },
            },
          ],
          responses: { "422": errorResponse },
        }),
      },
      "/api/v1/agent/journal": {
        get: op({
          operationId: "getJournal",
          summary: "Investment journal",
          description:
            "Read decisions with pinned dossier_version, fill-based 30/90/180d vs SPY, and append-only outcomes. price_data_through is the last bar used. Outcomes do not set reviewed_at.",
          scope: "powerfund:journal:read",
          mutating: false,
          parameters: [
            {
              name: "symbol",
              in: "query",
              description: "Filter to one ticker.",
              schema: { type: "string" },
            },
            {
              name: "decision_type",
              in: "query",
              description: "Filter: enter, add, reduce, exit, hold, or watch.",
              schema: {
                type: "string",
                enum: ["enter", "add", "reduce", "exit", "hold", "watch"],
              },
            },
            {
              name: "date_from",
              in: "query",
              description: "Inclusive lower bound on action_at.",
              schema: { type: "string", format: "date-time" },
            },
            {
              name: "date_to",
              in: "query",
              description: "Inclusive upper bound on action_at.",
              schema: { type: "string", format: "date-time" },
            },
            {
              name: "limit",
              in: "query",
              description: "Page size. Default 50, max 100.",
              schema: { type: "integer", default: 50, maximum: 100 },
            },
            {
              name: "before",
              in: "query",
              description: "Return rows older than this action_at.",
              schema: { type: "string", format: "date-time" },
            },
          ],
        }),
      },
      "/api/v1/agent/deployment-queue": {
        get: op({
          operationId: "getPlannedActions",
          summary: "Open deployment queue",
          description:
            "Pending and deferred intended trades. This is not execution and not the review queue.",
          scope: "powerfund:deployment:read",
          mutating: false,
        }),
      },
      "/api/v1/agent/research": {
        get: op({
          operationId: "getResearchInbox",
          summary: "Briefing Research tab",
          description:
            "Briefing Research tab, derived. Same clocks as the UI. Read-only. review_due_date clears only if next_review_at is advanced or cleared; diligence needs a save that updates updated_at. Not the daily sweep.",
          scope: "powerfund:dossier:read",
          mutating: false,
          parameters: [
            {
              name: "kind",
              in: "query",
              description:
                "Comma-separated kinds: needs_dossier, review_due_date, diligence. Example: needs_dossier,diligence. Omit for every kind.",
              schema: {
                type: "string",
                pattern:
                  "^(needs_dossier|review_due_date|diligence)(,(needs_dossier|review_due_date|diligence))*$",
              },
            },
          ],
          responses: {
            "200": jsonOkBody({
              type: "object",
              properties: {
                as_of: { type: "string", format: "date-time" },
                returned: { type: "integer" },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      kind: {
                        type: "string",
                        enum: [
                          "needs_dossier",
                          "review_due_date",
                          "diligence",
                        ],
                      },
                      symbol: { type: "string" },
                      name: { type: "string" },
                      next_review_at: { type: ["string", "null"] },
                      next_diligence: { type: ["string", "null"] },
                      updated_at: {
                        type: ["string", "null"],
                        format: "date-time",
                      },
                      dossier_status: { type: ["string", "null"] },
                      current_version_id: { type: ["string", "null"] },
                      current_version_number: { type: ["integer", "null"] },
                      age_days: {
                        type: ["integer", "null"],
                        description:
                          "Days since updated_at. Drives the 14-day diligence clock. Null when there is no dossier.",
                      },
                      due_since: {
                        type: ["string", "null"],
                        description:
                          "Calendar day the row became due. next_review_at, or updated_at + 14 days. Null for needs_dossier.",
                      },
                      reason: { type: "string" },
                    },
                  },
                },
              },
            }),
            "422": errorResponse,
          },
        }),
      },
      "/api/v1/agent/companies/{symbol}": {
        get: op({
          operationId: "getCompanyDossier",
          summary: "Current company dossier",
          description:
            "Instrument metadata, live thesis, current version pointer, and last_close with last_close_session. price_data_stale means the last completed US cash session is missing.",
          scope: "powerfund:dossier:read",
          mutating: false,
          parameters: [symbolParam],
          responses: { "404": errorResponse },
        }),
      },
      "/api/v1/agent/companies/{symbol}/versions": {
        get: op({
          operationId: "getDossierVersions",
          summary: "Dossier version history",
          description:
            "Immutable snapshot headers for a company. Does not include full snapshot bodies.",
          scope: "powerfund:dossier:read",
          mutating: false,
          parameters: [symbolParam],
        }),
      },
      "/api/v1/agent/companies/{symbol}/versions/{version}": {
        get: op({
          operationId: "getDossierVersion",
          summary: "One dossier snapshot",
          description:
            "Assembled JSON believed at that version. Use this to answer what we believed when a decision was made.",
          scope: "powerfund:dossier:read",
          mutating: false,
          parameters: [
            symbolParam,
            {
              name: "version",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "version_number (for example 3) or version UUID.",
            },
          ],
        }),
      },
      "/api/v1/agent/companies/{symbol}/dossier": {
        patch: op({
          operationId: "updateDossier",
          summary: "Update the live dossier",
          description:
            "Writes the live dossier and creates the next version only if assembled JSON changed. Send expected_version to avoid clobbering. Do not POST versions separately.",
          scope: "powerfund:dossier:write",
          mutating: true,
          parameters: [symbolParam],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["change_reason", "changes"],
                  properties: {
                    expected_version: {
                      type: "integer",
                      description: "Current version_number. Rejected with 409 if stale.",
                    },
                    change_reason: {
                      type: "string",
                      description: "Why this write is happening.",
                    },
                    actor_name: { type: "string" },
                    research_sources: {
                      type: "array",
                      items: { type: "string" },
                    },
                    changes: dossierChangesSchema,
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
      "/api/v1/agent/watchlist": {
        post: op({
          operationId: "addWatchlistCompany",
          summary: "Add a research watchlist company",
          description:
            "Insert a ticker as status=watchlist with an existing theme. Does not create a dossier, planned trade, or fill. Duplicate symbols return 409. Bars ingest on the next worker run.",
          scope: "powerfund:watchlist:write",
          mutating: true,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["symbol", "name", "theme"],
                  properties: {
                    symbol: {
                      type: "string",
                      description: "Ticker, for example HII.",
                    },
                    name: {
                      type: "string",
                      description: "Company name.",
                    },
                    theme: {
                      type: "string",
                      description:
                        "Existing theme slug or name. Use defence or Defence, not a free label.",
                    },
                    notes: { type: "string" },
                    asset_class: {
                      type: "string",
                      enum: ["equity", "etf", "commodity_proxy", "other"],
                      description: "Default equity.",
                    },
                    exchange: {
                      type: "string",
                      description: "Listing venue. Default US.",
                    },
                    actor_name: { type: "string" },
                  },
                },
                example: {
                  symbol: "HII",
                  name: "Huntington Ingalls",
                  theme: "defence",
                  notes: "Shipbuilding / navy",
                },
              },
            },
          },
          responses: {
            "200": addWatchlistCompanyOk,
            "404": errorResponse,
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
            "Creates a journal row and pins the current dossier version automatically. Do not send dossier_version_id.",
          scope: "powerfund:journal:append",
          mutating: true,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["symbol", "decision_type", "thesis"],
                  properties: {
                    symbol: { type: "string", description: "Ticker, for example MRCY." },
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
      "/api/v1/agent/decisions/{id}/outcome": {
        post: op({
          operationId: "recordDecisionOutcome",
          summary: "Record a decision outcome",
          description:
            "Append a structured grade to a journal row. Does not mutate thesis, reviewed_at, or outcome_grade. Weekly holds still need a new createDecision.",
          scope: "powerfund:journal:append",
          mutating: true,
          parameters: [
            uuidParam("id", "decisions row UUID from getJournal."),
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["thesis_grade", "lessons"],
                  properties: {
                    thesis_grade: {
                      type: "string",
                      enum: ["correct", "partly_correct", "wrong"],
                    },
                    timing_grade: {
                      type: "string",
                      enum: ["good", "mixed", "poor"],
                    },
                    sizing_grade: {
                      type: "string",
                      enum: ["good", "mixed", "poor"],
                    },
                    risk_management_grade: {
                      type: "string",
                      enum: ["good", "mixed", "poor"],
                    },
                    lessons: {
                      type: "string",
                      description: "What to repeat or change. Not a P&L dump.",
                    },
                    actor_name: { type: "string" },
                  },
                },
                example: {
                  thesis_grade: "correct",
                  timing_grade: "poor",
                  sizing_grade: "good",
                  risk_management_grade: "good",
                  lessons: "Right company, chased the first print.",
                },
              },
            },
          },
          responses: {
            "200": recordDecisionOutcomeOk,
            "404": errorResponse,
            "422": errorResponse,
          },
        }),
      },
      "/api/v1/agent/planned-actions": {
        post: op({
          operationId: "createPlannedAction",
          summary: "Propose a planned trade",
          description:
            "Inserts a pending intended trade. Send action_type plus planned_usd or target_weight_pct. Does not book a fill or create a transaction.",
          scope: "powerfund:deployment:write",
          mutating: true,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["symbol", "action_type"],
                  properties: {
                    symbol: { type: "string", description: "Ticker to trade." },
                    action_type: {
                      type: "string",
                      enum: ["buy", "add", "reduce", "sell"],
                    },
                    planned_usd: {
                      type: "number",
                      description: "Dollar size of the intended trade.",
                    },
                    target_weight_pct: {
                      type: "number",
                      description: "Optional. Converted to planned_usd using current NAV.",
                    },
                    window_label: {
                      type: "string",
                      description: "Human window such as price_below:290.",
                    },
                    due_by: {
                      type: "string",
                      format: "date",
                      description: "Optional date deadline.",
                    },
                    rationale: { type: "string" },
                  },
                },
                example: {
                  symbol: "CLS",
                  action_type: "add",
                  planned_usd: 15000,
                  window_label: "price_below:290",
                  rationale: "Second tranche if thesis remains intact",
                },
              },
            },
          },
        }),
      },
      "/api/v1/agent/planned-actions/{id}": {
        patch: op({
          operationId: "updatePlannedAction",
          summary: "Update a planned trade",
          description:
            "Update an open planned trade. Status may be pending, deferred, or cancelled. Confirming a fill is forbidden.",
          scope: "powerfund:deployment:write",
          mutating: true,
          parameters: [
            uuidParam("id", "planned_actions row UUID from getPlannedActions."),
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    action_type: {
                      type: "string",
                      enum: ["buy", "add", "reduce", "sell"],
                    },
                    planned_usd: { type: "number" },
                    target_weight_pct: { type: "number" },
                    window_label: { type: "string" },
                    due_by: { type: "string", format: "date" },
                    rationale: { type: "string" },
                    status: {
                      type: "string",
                      enum: ["pending", "deferred", "cancelled"],
                      description: "Cannot be confirmed. Humans book fills in the UI.",
                    },
                  },
                },
              },
            },
          },
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
            "Review tasks and their history, not trades. status=open (default) is the work queue; status=completed is the record of what the book concluded. Filter by symbol, theme, scope, completed_since to load prior beliefs before a comparable review. Distinct from planned_actions.",
          scope: "powerfund:reviews:read",
          mutating: false,
          parameters: [
            {
              name: "status",
              in: "query",
              description:
                "due, pending, in_progress, completed, deferred, cancelled, open, or all. Comma-separate to combine. Default open.",
              schema: {
                type: "string",
                enum: [
                  "open",
                  "all",
                  "pending",
                  "due",
                  "in_progress",
                  "completed",
                  "deferred",
                  "cancelled",
                ],
              },
            },
            {
              name: "scope",
              in: "query",
              description:
                "Restrict to company, theme, macro or portfolio reviews. Portfolio is the book-level record: monthly passes, quarterly reviews, stress diagnostics and capital-phase gates.",
              schema: {
                type: "string",
                enum: ["company", "theme", "macro", "portfolio"],
              },
            },
            {
              name: "symbol",
              in: "query",
              description:
                "Ticker, or comma-separated tickers. Matches any review linked to the name, including a macro or theme review that merely listed it. Does NOT reach scope=portfolio reviews, which carry no symbols by design — query those separately with scope=portfolio.",
              schema: { type: "string" },
            },
            {
              name: "theme",
              in: "query",
              description:
                "Theme slug or name, or a comma-separated list. Matches any review linked to the theme. Combined with symbol the two are a union, not an intersection.",
              schema: { type: "string" },
            },
            {
              name: "completed_since",
              in: "query",
              description:
                "Only reviews completed at or after this ISO date or datetime. A bare date means the start of that UTC day. Use the previous comparable review's completion date to read forward from it.",
              schema: { type: "string" },
            },
            {
              name: "completed_before",
              in: "query",
              description:
                "Only reviews completed before this ISO date or datetime.",
              schema: { type: "string" },
            },
            {
              name: "limit",
              in: "query",
              description:
                "Maximum tasks to return. Default 100, maximum 500. The response sets truncated when more exist.",
              schema: { type: "integer", minimum: 1, maximum: 500, default: 100 },
            },
            {
              name: "order",
              in: "query",
              description:
                "asc or desc. Defaults to desc for a completed-only query (newest first, so limit gives you the most recent) and asc otherwise.",
              schema: { type: "string", enum: ["asc", "desc"] },
            },
            {
              name: "evaluate",
              in: "query",
              description:
                "If true, mark satisfied pending tasks due before listing. Defaults to true, except on a completed-only query where it defaults to false because reading history should not mutate the queue.",
              schema: { type: "boolean" },
            },
          ],
          responses: {
            "200": reviewQueueOk,
          },
        }),
      },
      "/api/v1/agent/review-tasks": {
        post: op({
          operationId: "createReviewTask",
          summary: "Create a review obligation",
          description:
            "Create a pending review. trigger.type is scheduled, event_window, or condition. Scheduled uses at. Event window uses not_before and due_by. Condition uses metric, symbol, operator, value. Not a trade.",
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
                    title: { type: "string", description: "Short review title." },
                    instructions: {
                      type: "string",
                      description: "What the reviewer should reassess.",
                    },
                    scope: {
                      type: "string",
                      enum: ["company", "theme", "portfolio", "macro"],
                      description: "company needs symbols. theme needs themes slugs.",
                    },
                    priority: {
                      type: "string",
                      enum: ["low", "normal", "high", "urgent"],
                    },
                    symbols: {
                      type: "array",
                      items: { type: "string" },
                      description: "Tickers, for example MRCY.",
                    },
                    themes: {
                      type: "array",
                      items: { type: "string" },
                      description:
                        "Theme slug or name. Use ai-infrastructure or AI Infrastructure, not a free label.",
                    },
                    trigger: reviewTriggerSchema,
                  },
                },
                example: {
                  title: "Reassess energy sleeve after Jackson Hole",
                  instructions:
                    "Re-read the energy thesis if the chair signals a slower cut path.",
                  scope: "theme",
                  priority: "high",
                  themes: ["energy"],
                  trigger: {
                    type: "event_window",
                    not_before: "2026-08-22T00:00:00Z",
                    due_by: "2026-08-29T00:00:00Z",
                  },
                },
              },
            },
          },
          responses: {
            "200": createReviewTaskOk,
            "404": errorResponse,
            "422": errorResponse,
          },
        }),
      },
      "/api/v1/agent/review-tasks/{id}": {
        patch: op({
          operationId: "updateReviewTask",
          summary: "Update a review obligation",
          description:
            "Update an open review. Status may be pending, in_progress, deferred, or cancelled. Cannot set due or completed. Trigger shape matches createReviewTask.",
          scope: "powerfund:reviews:write",
          mutating: true,
          parameters: [uuidParam("id", "review_tasks row UUID from getReviewQueue.")],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
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
                    status: {
                      type: "string",
                      enum: ["pending", "in_progress", "deferred", "cancelled"],
                      description:
                        "Cannot be due or completed. Triggers mark due; use completeReviewTask to finish.",
                    },
                    symbols: { type: "array", items: { type: "string" } },
                    themes: { type: "array", items: { type: "string" } },
                    trigger: reviewTriggerSchema,
                  },
                },
              },
            },
          },
          responses: {
            "200": updateReviewTaskOk,
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
            "Record an outcome. Optional outputs link existing dossier_version, decision, or planned_action ids. Does not create those rows or book a fill.",
          scope: "powerfund:reviews:write",
          mutating: true,
          parameters: [uuidParam("id", "review_tasks row UUID from getReviewQueue.")],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["outcome"],
                  properties: {
                    outcome: {
                      type: "string",
                      description: "What you concluded.",
                    },
                    outputs: {
                      type: "array",
                      description:
                        "Links to work that already exists. kind cannot be transaction.",
                      items: {
                        type: "object",
                        required: ["kind", "entity_id"],
                        properties: {
                          kind: {
                            type: "string",
                            enum: [
                              "dossier_version",
                              "decision",
                              "planned_action",
                            ],
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
          responses: {
            "200": completeReviewTaskOk,
            "404": errorResponse,
            "422": errorResponse,
          },
        }),
      },
    },
  };
}
