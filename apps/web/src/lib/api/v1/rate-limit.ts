const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;

const hitsByKey = new Map<string, number[]>();

export const RATE_LIMIT_MAX = MAX_REQUESTS;
export const RATE_LIMIT_WINDOW_SECONDS = WINDOW_MS / 1000;

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function rateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const recent = (hitsByKey.get(key) ?? []).filter(
    (stamp) => now - stamp < WINDOW_MS,
  );
  if (recent.length >= MAX_REQUESTS) {
    hitsByKey.set(key, recent);
    const oldest = recent[0] ?? now;
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((WINDOW_MS - (now - oldest)) / 1000),
      ),
    };
  }

  recent.push(now);
  hitsByKey.set(key, recent);
  return {
    ok: true,
    remaining: MAX_REQUESTS - recent.length,
    retryAfterSeconds: 0,
  };
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    request.headers.get("x-nf-client-connection-ip") ??
    request.headers.get("x-real-ip") ??
    "anonymous"
  );
}
