import {
  clientKey,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_SECONDS,
  rateLimit,
} from "./rate-limit";

export const CACHE_DOCS = "public, max-age=300, stale-while-revalidate=3600";
export const CACHE_CATALOG = "public, max-age=60, stale-while-revalidate=300";
export const CACHE_INDEX = "public, max-age=300, stale-while-revalidate=3600";

export function wantsMarkdown(request: Request): boolean {
  const format = new URL(request.url).searchParams.get("format");
  if (format === "md" || format === "markdown") return true;
  if (format === "json") return false;

  const accept = request.headers.get("accept") ?? "";
  const markdown = accept.includes("text/markdown");
  const json = accept.includes("application/json");
  return markdown && !json;
}

export function publicHeaders(args: {
  cacheControl: string;
  contentType: string;
  remaining: number;
}): Headers {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Accept, Content-Type");
  headers.set("Cache-Control", args.cacheControl);
  headers.set("Content-Type", args.contentType);
  headers.set("X-RateLimit-Limit", String(RATE_LIMIT_MAX));
  headers.set("X-RateLimit-Remaining", String(args.remaining));
  headers.set("X-RateLimit-Window", String(RATE_LIMIT_WINDOW_SECONDS));
  return headers;
}

export function corsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: publicHeaders({
      cacheControl: CACHE_INDEX,
      contentType: "text/plain",
      remaining: RATE_LIMIT_MAX,
    }),
  });
}

export function jsonResponse(
  body: unknown,
  args: { status?: number; cacheControl: string; remaining: number },
): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status: args.status ?? 200,
    headers: publicHeaders({
      cacheControl: args.cacheControl,
      contentType: "application/json; charset=utf-8",
      remaining: args.remaining,
    }),
  });
}

export function markdownResponse(
  body: string,
  args: { status?: number; cacheControl: string; remaining: number },
): Response {
  return new Response(body, {
    status: args.status ?? 200,
    headers: publicHeaders({
      cacheControl: args.cacheControl,
      contentType: "text/markdown; charset=utf-8",
      remaining: args.remaining,
    }),
  });
}

export function errorResponse(
  status: number,
  message: string,
  remaining: number,
): Response {
  return jsonResponse(
    { error: message, status },
    { status, cacheControl: "no-store", remaining },
  );
}

export async function handlePublicGet(
  request: Request,
  cacheControl: string,
  handler: (remaining: number) => Promise<Response>,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return corsPreflight();
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return errorResponse(405, "Method not allowed", RATE_LIMIT_MAX);
  }

  const limited = rateLimit(clientKey(request));
  if (!limited.ok) {
    const response = errorResponse(
      429,
      "Rate limit exceeded. Try again shortly.",
      0,
    );
    response.headers.set("Retry-After", String(limited.retryAfterSeconds));
    return response;
  }

  try {
    return await handler(limited.remaining);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    console.error("Public catalog error", error);
    return errorResponse(500, message, limited.remaining);
  }
}
