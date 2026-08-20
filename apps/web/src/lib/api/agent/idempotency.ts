import { createHash } from "node:crypto";
import type { Json } from "@powerfund/db";

import type { DbClient } from "@/lib/supabase/db";

import { conflict } from "./errors";

const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

export type IdempotencyRecord = {
  status_code: number;
  response: unknown;
};

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

export async function loadIdempotency(
  supabase: DbClient,
  keyName: string,
  idempotencyKey: string,
  hash: string,
): Promise<IdempotencyRecord | null> {
  const { data, error } = await supabase
    .from("agent_idempotency_keys")
    .select("request_hash, status_code, response")
    .eq("key_name", keyName)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load idempotency key: ${error.message}`);
  }
  if (!data) return null;
  if (data.request_hash !== hash) {
    throw conflict(
      "IDEMPOTENCY_KEY_REUSED",
      "This Idempotency-Key was already used with a different request body.",
    );
  }
  return {
    status_code: data.status_code,
    response: data.response,
  };
}

export async function storeIdempotency(
  supabase: DbClient,
  args: {
    keyName: string;
    idempotencyKey: string;
    operation: string;
    hash: string;
    statusCode: number;
    response: unknown;
  },
): Promise<void> {
  const { error } = await supabase.from("agent_idempotency_keys").insert({
    key_name: args.keyName,
    idempotency_key: args.idempotencyKey,
    operation: args.operation,
    request_hash: args.hash,
    status_code: args.statusCode,
    response: args.response as Json,
  });

  if (!error) return;
  if (error.code === "23505") {
    const existing = await loadIdempotency(
      supabase,
      args.keyName,
      args.idempotencyKey,
      args.hash,
    );
    if (existing) return;
    throw conflict(
      "IDEMPOTENCY_KEY_REUSED",
      "This Idempotency-Key was already used with a different request body.",
    );
  }
  throw new Error(`Failed to store idempotency key: ${error.message}`);
}
