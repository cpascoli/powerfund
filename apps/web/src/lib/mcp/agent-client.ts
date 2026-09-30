import { createHash } from "node:crypto";

import { MCP_KEY_PREFIX } from "@/lib/api/agent/idempotency";
import { runAsInternalPrincipal } from "@/lib/api/agent/internal-principal";
import type { AgentPrincipal } from "@/lib/api/agent/auth";

import * as calibrationRoute from "@/app/api/v1/agent/calibration/route";
import * as companyRoute from "@/app/api/v1/agent/companies/[symbol]/route";
import * as dossierRoute from "@/app/api/v1/agent/companies/[symbol]/dossier/route";
import * as versionRoute from "@/app/api/v1/agent/companies/[symbol]/versions/[version]/route";
import * as versionsRoute from "@/app/api/v1/agent/companies/[symbol]/versions/route";
import * as outcomeRoute from "@/app/api/v1/agent/decisions/[id]/outcome/route";
import * as decisionsRoute from "@/app/api/v1/agent/decisions/route";
import * as deploymentQueueRoute from "@/app/api/v1/agent/deployment-queue/route";
import * as journalRoute from "@/app/api/v1/agent/journal/route";
import * as performanceRoute from "@/app/api/v1/agent/performance/route";
import * as plannedActionRoute from "@/app/api/v1/agent/planned-actions/[id]/route";
import * as plannedActionsRoute from "@/app/api/v1/agent/planned-actions/route";
import * as portfolioRoute from "@/app/api/v1/agent/portfolio/route";
import * as researchRoute from "@/app/api/v1/agent/research/route";
import * as reviewQueueRoute from "@/app/api/v1/agent/review-queue/route";
import * as completeReviewRoute from "@/app/api/v1/agent/review-tasks/[id]/complete/route";
import * as reviewTaskRoute from "@/app/api/v1/agent/review-tasks/[id]/route";
import * as reviewTasksRoute from "@/app/api/v1/agent/review-tasks/route";
import * as stateRoute from "@/app/api/v1/agent/state/route";
import * as watchlistSymbolRoute from "@/app/api/v1/agent/watchlist/[symbol]/route";
import * as watchlistRoute from "@/app/api/v1/agent/watchlist/route";

/**
 * The MCP server's view of PowerFund: one method per `/api/v1/agent`
 * operation, named by its OpenAPI operationId.
 *
 * MCP tools depend on this interface, never on route modules or Supabase, so
 * a tool test swaps in a fake and a later out-of-process deployment could swap
 * in an HTTP implementation without touching a tool.
 */
export type Query = Record<string, string | number | boolean | undefined>;
export type Json = Record<string, unknown>;

export type WriteOptions = {
  /** Sent as Idempotency-Key. Identical retries replay the stored result. */
  idempotencyKey?: string;
};

export interface PowerFundAgentClient {
  getFundState(query?: Query): Promise<Json>;
  getPortfolio(): Promise<Json>;
  getPerformance(query?: Query): Promise<Json>;
  getJournal(query?: Query): Promise<Json>;
  getCalibrationStatus(): Promise<Json>;
  getPlannedActions(): Promise<Json>;
  getResearchInbox(query?: Query): Promise<Json>;
  getReviewQueue(query?: Query): Promise<Json>;
  getCompanyDossier(symbol: string): Promise<Json>;
  getDossierVersions(symbol: string): Promise<Json>;
  getDossierVersion(symbol: string, version: string): Promise<Json>;

  updateDossier(symbol: string, body: Json, options?: WriteOptions): Promise<Json>;
  createDecision(body: Json, options?: WriteOptions): Promise<Json>;
  recordDecisionOutcome(id: string, body: Json, options?: WriteOptions): Promise<Json>;
  createPlannedAction(body: Json, options?: WriteOptions): Promise<Json>;
  updatePlannedAction(id: string, body: Json, options?: WriteOptions): Promise<Json>;
  createReviewTask(body: Json, options?: WriteOptions): Promise<Json>;
  updateReviewTask(id: string, body: Json, options?: WriteOptions): Promise<Json>;
  completeReviewTask(id: string, body: Json, options?: WriteOptions): Promise<Json>;
  addWatchlistCompany(body: Json, options?: WriteOptions): Promise<Json>;
  setWatchlistArchived(symbol: string, body: Json, options?: WriteOptions): Promise<Json>;
}

/**
 * A non-2xx answer from the agent API, kept distinct from failures in the MCP
 * layer itself so a log line and the model can both tell "PowerFund refused
 * this" from "the adapter broke".
 */
export class AgentApiCallError extends Error {
  readonly operationId: string;
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(args: {
    operationId: string;
    status: number;
    code: string;
    message: string;
    details?: Record<string, unknown>;
  }) {
    super(args.message);
    this.name = "AgentApiCallError";
    this.operationId = args.operationId;
    this.status = args.status;
    this.code = args.code;
    this.details = args.details ?? {};
  }
}

type RouteHandler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;

type CallSpec = {
  operationId: string;
  method: "GET" | "POST" | "PATCH";
  path: string;
  handler: RouteHandler;
  params?: Record<string, string>;
  query?: Query;
  body?: Json;
  idempotencyKey?: string;
};

function asRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Runs the agent route handlers in this process as `principal`.
 *
 * Why not HTTP: a loopback request from one Netlify function to the same site
 * pays a second cold start and a second function invocation per tool call,
 * needs a server-held credential to present, and would route an OAuth caller
 * through an agent key — losing who actually asked. Calling the exported
 * handlers keeps every check the REST API makes, with the MCP caller's own
 * principal and scopes.
 */
export class InProcessAgentClient implements PowerFundAgentClient {
  constructor(
    private readonly principal: AgentPrincipal,
    private readonly args: {
      /** Origin of the MCP request; only used to build well-formed URLs. */
      origin: string;
      /** Forwarded so the per-caller rate limit buckets match the REST API. */
      clientAddress?: string;
    },
  ) {}

  private async call(spec: CallSpec): Promise<Json> {
    const url = new URL(spec.path, this.args.origin);
    for (const [key, value] of Object.entries(spec.query ?? {})) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
    const headers = new Headers({ accept: "application/json" });
    if (this.args.clientAddress) {
      headers.set("x-forwarded-for", this.args.clientAddress);
    }
    let body: string | undefined;
    if (spec.body !== undefined) {
      body = JSON.stringify(spec.body);
      headers.set("content-type", "application/json");
    }
    if (spec.idempotencyKey) {
      headers.set("idempotency-key", spec.idempotencyKey);
    }

    const response = await runAsInternalPrincipal(this.principal, () =>
      spec.handler(new Request(url, { method: spec.method, headers, body }), {
        params: Promise.resolve(spec.params ?? {}),
      }),
    );

    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text.length > 0 ? JSON.parse(text) : {};
    } catch {
      throw new AgentApiCallError({
        operationId: spec.operationId,
        status: response.status,
        code: "MALFORMED_RESPONSE",
        message: "The PowerFund API returned a response that is not JSON.",
      });
    }

    if (!response.ok) {
      const error = asRecord(parsed) && asRecord(parsed.error) ? parsed.error : {};
      const { code, message, ...details } = error;
      throw new AgentApiCallError({
        operationId: spec.operationId,
        status: response.status,
        code: typeof code === "string" ? code : "HTTP_" + response.status,
        message:
          typeof message === "string"
            ? message
            : `PowerFund API returned HTTP ${response.status}.`,
        details,
      });
    }
    if (!asRecord(parsed)) {
      throw new AgentApiCallError({
        operationId: spec.operationId,
        status: response.status,
        code: "MALFORMED_RESPONSE",
        message: "The PowerFund API returned JSON that is not an object.",
      });
    }
    return parsed;
  }

  getFundState(query?: Query) {
    return this.call({ operationId: "getFundState", method: "GET", path: "/api/v1/agent/state", handler: stateRoute.GET, query });
  }
  getPortfolio() {
    return this.call({ operationId: "getPortfolio", method: "GET", path: "/api/v1/agent/portfolio", handler: portfolioRoute.GET });
  }
  getPerformance(query?: Query) {
    return this.call({ operationId: "getPerformance", method: "GET", path: "/api/v1/agent/performance", handler: performanceRoute.GET, query });
  }
  getJournal(query?: Query) {
    return this.call({ operationId: "getJournal", method: "GET", path: "/api/v1/agent/journal", handler: journalRoute.GET, query });
  }
  getCalibrationStatus() {
    return this.call({ operationId: "getCalibrationStatus", method: "GET", path: "/api/v1/agent/calibration", handler: calibrationRoute.GET });
  }
  getPlannedActions() {
    return this.call({ operationId: "getPlannedActions", method: "GET", path: "/api/v1/agent/deployment-queue", handler: deploymentQueueRoute.GET });
  }
  getResearchInbox(query?: Query) {
    return this.call({ operationId: "getResearchInbox", method: "GET", path: "/api/v1/agent/research", handler: researchRoute.GET, query });
  }
  getReviewQueue(query?: Query) {
    return this.call({ operationId: "getReviewQueue", method: "GET", path: "/api/v1/agent/review-queue", handler: reviewQueueRoute.GET, query });
  }
  getCompanyDossier(symbol: string) {
    return this.call({ operationId: "getCompanyDossier", method: "GET", path: `/api/v1/agent/companies/${encodeURIComponent(symbol)}`, handler: companyRoute.GET as RouteHandler, params: { symbol } });
  }
  getDossierVersions(symbol: string) {
    return this.call({ operationId: "getDossierVersions", method: "GET", path: `/api/v1/agent/companies/${encodeURIComponent(symbol)}/versions`, handler: versionsRoute.GET as RouteHandler, params: { symbol } });
  }
  getDossierVersion(symbol: string, version: string) {
    return this.call({ operationId: "getDossierVersion", method: "GET", path: `/api/v1/agent/companies/${encodeURIComponent(symbol)}/versions/${encodeURIComponent(version)}`, handler: versionRoute.GET as RouteHandler, params: { symbol, version } });
  }

  updateDossier(symbol: string, body: Json, options?: WriteOptions) {
    return this.call({ operationId: "updateDossier", method: "PATCH", path: `/api/v1/agent/companies/${encodeURIComponent(symbol)}/dossier`, handler: dossierRoute.PATCH as RouteHandler, params: { symbol }, body, ...options });
  }
  createDecision(body: Json, options?: WriteOptions) {
    return this.call({ operationId: "createDecision", method: "POST", path: "/api/v1/agent/decisions", handler: decisionsRoute.POST, body, ...options });
  }
  recordDecisionOutcome(id: string, body: Json, options?: WriteOptions) {
    return this.call({ operationId: "recordDecisionOutcome", method: "POST", path: `/api/v1/agent/decisions/${encodeURIComponent(id)}/outcome`, handler: outcomeRoute.POST as RouteHandler, params: { id }, body, ...options });
  }
  createPlannedAction(body: Json, options?: WriteOptions) {
    return this.call({ operationId: "createPlannedAction", method: "POST", path: "/api/v1/agent/planned-actions", handler: plannedActionsRoute.POST, body, ...options });
  }
  updatePlannedAction(id: string, body: Json, options?: WriteOptions) {
    return this.call({ operationId: "updatePlannedAction", method: "PATCH", path: `/api/v1/agent/planned-actions/${encodeURIComponent(id)}`, handler: plannedActionRoute.PATCH as RouteHandler, params: { id }, body, ...options });
  }
  createReviewTask(body: Json, options?: WriteOptions) {
    return this.call({ operationId: "createReviewTask", method: "POST", path: "/api/v1/agent/review-tasks", handler: reviewTasksRoute.POST, body, ...options });
  }
  updateReviewTask(id: string, body: Json, options?: WriteOptions) {
    return this.call({ operationId: "updateReviewTask", method: "PATCH", path: `/api/v1/agent/review-tasks/${encodeURIComponent(id)}`, handler: reviewTaskRoute.PATCH as RouteHandler, params: { id }, body, ...options });
  }
  completeReviewTask(id: string, body: Json, options?: WriteOptions) {
    return this.call({ operationId: "completeReviewTask", method: "POST", path: `/api/v1/agent/review-tasks/${encodeURIComponent(id)}/complete`, handler: completeReviewRoute.POST as RouteHandler, params: { id }, body, ...options });
  }
  addWatchlistCompany(body: Json, options?: WriteOptions) {
    return this.call({ operationId: "addWatchlistCompany", method: "POST", path: "/api/v1/agent/watchlist", handler: watchlistRoute.POST, body, ...options });
  }
  setWatchlistArchived(symbol: string, body: Json, options?: WriteOptions) {
    return this.call({ operationId: "setWatchlistArchived", method: "PATCH", path: `/api/v1/agent/watchlist/${encodeURIComponent(symbol)}`, handler: watchlistSymbolRoute.PATCH as RouteHandler, params: { symbol }, body, ...options });
  }
}

/**
 * Idempotency key for a write made through MCP: the tool and its exact
 * arguments. A model that sees a timeout retries with the same arguments, so
 * the retry carries the same key and the agent API either replays the first
 * result, reports it still running, or reports that an earlier attempt's
 * outcome is unknown; it does not run the write a second time.
 *
 * The key has no clock in it. A fixed time bucket put a boundary inside the
 * retry window (a write at 10:59:59 retried at 11:00:00 got a new key).
 * Instead the agent API gives `mcp:` keys a sliding window
 * (MCP_KEY_WINDOW_MS, one hour from the first attempt), after which the
 * same write deliberately made again is new.
 */
export function mcpIdempotencyKey(tool: string, args: unknown): string {
  const digest = createHash("sha256")
    .update(canonicalJson(args))
    .digest("hex")
    .slice(0, 40);
  return `${MCP_KEY_PREFIX}${tool}:${digest}`;
}

/** Key-order independent JSON, so `{a,b}` and `{b,a}` hash alike. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, next]) => next !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([key, next]) => `${JSON.stringify(key)}:${canonicalJson(next)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}
