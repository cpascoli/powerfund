import { createHash } from "node:crypto";
import type { Json } from "@powerfund/db";

import type { DbClient } from "@/lib/supabase/db";

import { AgentApiError, conflict } from "./errors";

const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

/**
 * Idempotency keys are *reserved before* the write runs, not recorded after.
 *
 * Recording only after completion left a window: a caller whose request timed
 * out (the MCP adapter stops waiting after 20 s; a model then retries) could
 * send the same key while the first attempt was still running, find nothing
 * stored, and execute the write a second time. A reservation closes it:
 *
 *   status_code  0  in progress   → an identical request gets 409 IDEMPOTENCY_IN_PROGRESS (retryable)
 *   status_code >0  completed     → replay the stored response
 *   status_code -1  released      → the attempt failed without a cacheable answer; the next attempt may run
 *
 * A reservation still "in progress" after RESERVATION_STALE_MS belongs to an
 * invocation that is certainly dead (Netlify kills functions at 60 s), so the
 * next attempt takes it over. Takeovers are conditional updates, so two
 * retries cannot both win.
 *
 * Keys minted by the MCP adapter (`mcp:` prefix) are content-derived rather
 * than random, so they need an end: a completed one replays for
 * MCP_KEY_WINDOW_MS after it was first reserved and is then free to run
 * again. An identical write a day later is a new decision; one a minute later
 * is a retry. Random keys from other callers keep permanent replay, as before.
 */
export const RESERVATION_STALE_MS = 5 * 60 * 1000;
export const MCP_KEY_WINDOW_MS = 60 * 60 * 1000;
export const MCP_KEY_PREFIX = "mcp:";

const IN_PROGRESS = 0;
const RELEASED = -1;

export type IdempotencyRow = {
  id: string;
  request_hash: string;
  status_code: number;
  response: unknown;
  created_at: string;
};

export type Takeover =
  | { from: "released" }
  | { from: "stale"; before: string }
  | { from: "expired"; before: string };

export interface IdempotencyStore {
  /** Insert an in-progress reservation; `null` when the key already exists. */
  reserve(row: {
    keyName: string;
    idempotencyKey: string;
    operation: string;
    hash: string;
    at: string;
  }): Promise<string | null>;
  find(keyName: string, idempotencyKey: string): Promise<IdempotencyRow | null>;
  /** Conditionally turn an existing row back into a fresh reservation. */
  takeover(id: string, condition: Takeover, at: string): Promise<boolean>;
  complete(id: string, statusCode: number, response: unknown): Promise<void>;
  release(id: string): Promise<void>;
}

export type Reservation =
  | { kind: "reserved"; id: string }
  | { kind: "replay"; status_code: number; response: unknown };

export function requestHash(method: string, path: string, body: string): string {
  return createHash("sha256")
    .update(`${method}:${path}\n${body}`)
    .digest("hex");
}

export function readIdempotencyKey(request: Request): string | null {
  const raw = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!raw) return null;
  if (raw.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw conflict(
      "IDEMPOTENCY_KEY_INVALID",
      `Idempotency-Key must be at most ${MAX_IDEMPOTENCY_KEY_LENGTH} characters.`,
    );
  }
  return raw;
}

function inProgress(): AgentApiError {
  return conflict(
    "IDEMPOTENCY_IN_PROGRESS",
    "An identical request with this Idempotency-Key is still running. Retry shortly; it will replay the result once it finishes.",
  );
}

export async function reserveIdempotency(
  store: IdempotencyStore,
  args: { keyName: string; idempotencyKey: string; operation: string; hash: string },
  now = new Date(),
): Promise<Reservation> {
  const at = now.toISOString();
  const inserted = await store.reserve({ ...args, at });
  if (inserted) return { kind: "reserved", id: inserted };

  const row = await store.find(args.keyName, args.idempotencyKey);
  // The row existed a moment ago and rows are never deleted; treat a miss as
  // a concurrent writer rather than guess.
  if (!row) throw inProgress();
  if (row.request_hash !== args.hash) {
    throw conflict(
      "IDEMPOTENCY_KEY_REUSED",
      "This Idempotency-Key was already used with a different request body.",
    );
  }

  const age = now.getTime() - Date.parse(row.created_at);
  let takeover: Takeover | null = null;
  if (row.status_code > 0) {
    const windowed = args.idempotencyKey.startsWith(MCP_KEY_PREFIX);
    if (!windowed || age < MCP_KEY_WINDOW_MS) {
      return { kind: "replay", status_code: row.status_code, response: row.response };
    }
    takeover = { from: "expired", before: new Date(now.getTime() - MCP_KEY_WINDOW_MS).toISOString() };
  } else if (row.status_code === RELEASED) {
    takeover = { from: "released" };
  } else if (age >= RESERVATION_STALE_MS) {
    takeover = { from: "stale", before: new Date(now.getTime() - RESERVATION_STALE_MS).toISOString() };
  }

  if (takeover && (await store.takeover(row.id, takeover, at))) {
    return { kind: "reserved", id: row.id };
  }
  throw inProgress();
}

export function supabaseIdempotencyStore(supabase: DbClient): IdempotencyStore {
  const fail = (what: string, error: { message: string }): never => {
    throw new Error(`Idempotency ${what} failed: ${error.message}`);
  };
  return {
    async reserve(row) {
      const { data, error } = await supabase
        .from("agent_idempotency_keys")
        .insert({
          key_name: row.keyName,
          idempotency_key: row.idempotencyKey,
          operation: row.operation,
          request_hash: row.hash,
          status_code: IN_PROGRESS,
          response: {} as Json,
          created_at: row.at,
        })
        .select("id")
        .single();
      if (error?.code === "23505") return null;
      if (error) fail("reserve", error);
      return (data as { id: string }).id;
    },
    async find(keyName, idempotencyKey) {
      const { data, error } = await supabase
        .from("agent_idempotency_keys")
        .select("id, request_hash, status_code, response, created_at")
        .eq("key_name", keyName)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (error) fail("lookup", error);
      return (data as IdempotencyRow | null) ?? null;
    },
    async takeover(id, condition, at) {
      let query = supabase
        .from("agent_idempotency_keys")
        .update({ status_code: IN_PROGRESS, response: {} as Json, created_at: at })
        .eq("id", id);
      if (condition.from === "released") query = query.eq("status_code", RELEASED);
      if (condition.from === "stale") query = query.eq("status_code", IN_PROGRESS).lt("created_at", condition.before);
      if (condition.from === "expired") query = query.gt("status_code", 0).lt("created_at", condition.before);
      const { data, error } = await query.select("id");
      if (error) fail("takeover", error);
      return (data?.length ?? 0) === 1;
    },
    async complete(id, statusCode, response) {
      const { error } = await supabase
        .from("agent_idempotency_keys")
        .update({ status_code: statusCode, response: response as Json })
        .eq("id", id)
        .eq("status_code", IN_PROGRESS);
      if (error) fail("complete", error);
    },
    async release(id) {
      const { error } = await supabase
        .from("agent_idempotency_keys")
        .update({ status_code: RELEASED })
        .eq("id", id)
        .eq("status_code", IN_PROGRESS);
      if (error) fail("release", error);
    },
  };
}

/** Same contract, in memory, for tests. Conditional updates are atomic here too. */
export function memoryIdempotencyStore(): IdempotencyStore & { rows: IdempotencyRow[] } {
  const rows: Array<IdempotencyRow & { key: string }> = [];
  let next = 1;
  const byId = (id: string) => rows.find((row) => row.id === id);
  return {
    rows,
    async reserve(row) {
      const key = `${row.keyName}\u0000${row.idempotencyKey}`;
      if (rows.some((existing) => existing.key === key)) return null;
      const id = `idem-${next++}`;
      rows.push({ id, key, request_hash: row.hash, status_code: IN_PROGRESS, response: {}, created_at: row.at });
      return id;
    },
    async find(keyName, idempotencyKey) {
      const row = rows.find((existing) => existing.key === `${keyName}\u0000${idempotencyKey}`);
      return row ? { ...row } : null;
    },
    async takeover(id, condition, at) {
      const row = byId(id);
      if (!row) return false;
      const eligible =
        condition.from === "released"
          ? row.status_code === RELEASED
          : condition.from === "stale"
            ? row.status_code === IN_PROGRESS && row.created_at < condition.before
            : row.status_code > 0 && row.created_at < condition.before;
      if (!eligible) return false;
      Object.assign(row, { status_code: IN_PROGRESS, response: {}, created_at: at });
      return true;
    },
    async complete(id, statusCode, response) {
      const row = byId(id);
      if (row?.status_code === IN_PROGRESS) Object.assign(row, { status_code: statusCode, response });
    },
    async release(id) {
      const row = byId(id);
      if (row?.status_code === IN_PROGRESS) row.status_code = RELEASED;
    },
  };
}
