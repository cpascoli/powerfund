import { createAdminClient } from "@/lib/supabase/admin";
import type { DbClient } from "@/lib/supabase/db";
import {
  clientKey,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_SECONDS,
  rateLimit,
} from "@/lib/api/v1/rate-limit";

import { authenticateAgent, requireScope, type AgentPrincipal } from "./auth";
import { AgentApiError } from "./errors";
import { currentInternalPrincipal } from "./internal-principal";
import {
  readIdempotencyKey,
  requestHash,
  reserveIdempotency,
  supabaseIdempotencyStore,
  type IdempotencyStore,
} from "./idempotency";
import type { AgentScope } from "./scopes";

export const AGENT_API_VERSION = "1.0.0";
export const MAX_AGENT_BODY_BYTES = 256 * 1024;

export type AgentContext = {
  request: Request;
  principal: AgentPrincipal;
  supabase: DbClient;
  remaining: number;
  bodyText: string;
};

function agentHeaders(remaining: number, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-RateLimit-Limit", String(RATE_LIMIT_MAX));
  headers.set("X-RateLimit-Remaining", String(remaining));
  headers.set("X-RateLimit-Window", String(RATE_LIMIT_WINDOW_SECONDS));
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Idempotency-Key, Accept",
  );
  return headers;
}

export function agentCorsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: agentHeaders(RATE_LIMIT_MAX),
  });
}

function omitNulls(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(omitNulls);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, next] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (next == null) continue;
      out[key] = omitNulls(next);
    }
    return out;
  }
  return value;
}

export function agentJson(
  body: unknown,
  args: { status?: number; remaining: number },
): Response {
  return new Response(JSON.stringify(omitNulls(body), null, 2), {
    status: args.status ?? 200,
    headers: agentHeaders(args.remaining),
  });
}

export function agentErrorResponse(
  error: AgentApiError,
  remaining: number,
): Response {
  return agentJson(
    {
      error: {
        code: error.code,
        message: error.message,
        ...error.details,
      },
    },
    { status: error.status, remaining },
  );
}

function requireAdmin(): DbClient {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new AgentApiError(
      500,
      "CONFIG",
      "Supabase is not configured on the server.",
    );
  }
  return supabase;
}

async function readBody(request: Request): Promise<string> {
  const declared = request.headers.get("content-length");
  if (declared) {
    const size = Number(declared);
    if (Number.isFinite(size) && size > MAX_AGENT_BODY_BYTES) {
      throw new AgentApiError(
        413,
        "PAYLOAD_TOO_LARGE",
        `Request body must be at most ${MAX_AGENT_BODY_BYTES} bytes.`,
      );
    }
  }
  const text = await request.text();
  if (text.length > MAX_AGENT_BODY_BYTES) {
    throw new AgentApiError(
      413,
      "PAYLOAD_TOO_LARGE",
      `Request body must be at most ${MAX_AGENT_BODY_BYTES} bytes.`,
    );
  }
  return text;
}

export async function parseJsonBody(bodyText: string): Promise<unknown> {
  if (bodyText.trim().length === 0) {
    return {};
  }
  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    throw new AgentApiError(422, "VALIDATION_ERROR", "Body must be valid JSON.");
  }
}

export async function handleAgentRequest(
  request: Request,
  args: {
    scope: AgentScope;
    methods: readonly string[];
    operationId: string;
    handler: (ctx: AgentContext) => Promise<Response>;
  },
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return agentCorsPreflight();
  }
  if (!(args.methods as readonly string[]).includes(request.method)) {
    return agentErrorResponse(
      new AgentApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed."),
      RATE_LIMIT_MAX,
    );
  }

  let remaining = RATE_LIMIT_MAX;
  try {
    // In-process callers (the MCP server) authenticate before they get here;
    // everything arriving over HTTP still has to present an agent key.
    const principal = currentInternalPrincipal() ?? authenticateAgent(request);
    // Namespaces key on a stable identity; the display name is attribution
    // only and, for OAuth clients, chosen by the client.
    const identity = principal.id ?? principal.name;
    const limited = rateLimit(`agent:${identity}:${clientKey(request)}`);
    remaining = limited.remaining;
    if (!limited.ok) {
      const response = agentErrorResponse(
        new AgentApiError(
          429,
          "RATE_LIMITED",
          "Rate limit exceeded. Try again shortly.",
        ),
        0,
      );
      response.headers.set("Retry-After", String(limited.retryAfterSeconds));
      return response;
    }

    requireScope(principal, args.scope);
    const supabase = requireAdmin();
    const bodyText =
      request.method === "GET" || request.method === "HEAD"
        ? ""
        : await readBody(request);

    const mutating = request.method === "POST" || request.method === "PATCH";
    const idempotencyKey = mutating ? readIdempotencyKey(request) : null;
    const hash = mutating
      ? requestHash(request.method, new URL(request.url).pathname, bodyText)
      : "";

    let reservation: { store: IdempotencyStore; id: string } | null = null;
    if (idempotencyKey) {
      const store = supabaseIdempotencyStore(supabase);
      const reserved = await reserveIdempotency(store, {
        keyName: identity,
        idempotencyKey,
        operation: args.operationId,
        hash,
      });
      if (reserved.kind === "replay") {
        return agentJson(reserved.response, {
          status: reserved.status_code,
          remaining,
        });
      }
      reservation = { store, id: reserved.id };
    }

    let response: Response;
    try {
      response = await args.handler({
        request,
        principal,
        supabase,
        remaining,
        bodyText,
      });
    } catch (error) {
      // No answer to replay: let the next attempt run.
      await reservation?.store.release(reservation.id).catch(() => {});
      throw error;
    }

    if (reservation) {
      const cacheable =
        response.status >= 200 &&
        response.status < 500 &&
        response.status !== 401 &&
        response.status !== 403 &&
        response.status !== 429;
      const cloned = cacheable ? await response.clone().json().catch(() => null) : null;
      if (cloned != null) {
        await reservation.store.complete(reservation.id, response.status, cloned);
      } else {
        await reservation.store.release(reservation.id);
      }
    }

    return response;
  } catch (error) {
    if (error instanceof AgentApiError) {
      return agentErrorResponse(error, remaining);
    }
    const message =
      error instanceof Error ? error.message : "Internal server error";
    console.error("Agent API error", error);
    return agentErrorResponse(
      new AgentApiError(500, "INTERNAL_ERROR", message),
      remaining,
    );
  }
}
