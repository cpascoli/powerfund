import type { Json } from "@powerfund/db";

import type { DbClient } from "@/lib/supabase/db";

export type ClientRecord = {
  client_id: string;
  registration: "dynamic" | "metadata_document";
  client_name: string | null;
  redirect_uris: string[];
  metadata: Record<string, unknown>;
  refreshed_at: string;
};

export type CodeRecord = {
  code_hash: string;
  client_id: string;
  user_id: string;
  redirect_uri: string;
  code_challenge: string;
  scopes: string[];
  resource: string;
  expires_at: string;
  used_at: string | null;
};

export type TokenRecord = {
  id: string;
  token_hash: string;
  kind: "access" | "refresh";
  client_id: string;
  user_id: string;
  principal_name: string;
  scopes: string[];
  resource: string;
  family_id: string;
  code_hash: string | null;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
};

export type NewToken = Omit<TokenRecord, "id" | "revoked_at" | "last_used_at">;

export type ConsumeResult =
  | { status: "consumed"; code: CodeRecord }
  | { status: "replayed"; code: CodeRecord }
  | { status: "missing" };

/**
 * Persistence for the authorization server. Every mutation is conditional
 * (`where used_at is null`, `where revoked_at is null`) so two concurrent
 * exchanges of one code, or two refreshes of one token, cannot both win.
 */
export interface OAuthStore {
  getClient(clientId: string): Promise<ClientRecord | null>;
  saveClient(client: ClientRecord): Promise<void>;
  insertCode(code: CodeRecord): Promise<void>;
  /** Marks the code used; reports a replay if it already was. */
  consumeCode(codeHash: string, now: Date): Promise<ConsumeResult>;
  insertTokens(tokens: NewToken[]): Promise<void>;
  findToken(tokenHash: string): Promise<TokenRecord | null>;
  /** True only for the caller that actually revoked it. */
  revokeToken(id: string, now: Date): Promise<boolean>;
  revokeFamily(familyId: string, now: Date): Promise<void>;
  revokeIssuedFromCode(codeHash: string, now: Date): Promise<void>;
  touchToken(id: string, now: Date): Promise<void>;
  isOperator(userId: string): Promise<boolean>;
}

function fail(what: string, error: { message: string }): never {
  throw new Error(`OAuth store: ${what} failed: ${error.message}`);
}

export function supabaseOAuthStore(db: DbClient): OAuthStore {
  return {
    async getClient(clientId) {
      const { data, error } = await db
        .from("oauth_clients")
        .select("client_id, registration, client_name, redirect_uris, metadata, refreshed_at")
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) fail("getClient", error);
      if (!data) return null;
      return {
        ...data,
        registration: data.registration as ClientRecord["registration"],
        metadata: (data.metadata ?? {}) as Record<string, unknown>,
      };
    },

    async saveClient(client) {
      const { error } = await db.from("oauth_clients").upsert(
        { ...client, metadata: client.metadata as Json },
        { onConflict: "client_id" },
      );
      if (error) fail("saveClient", error);
    },

    async insertCode(code) {
      const { error } = await db.from("oauth_authorization_codes").insert(code);
      if (error) fail("insertCode", error);
    },

    async consumeCode(codeHash, now) {
      const { data: updated, error } = await db
        .from("oauth_authorization_codes")
        .update({ used_at: now.toISOString() })
        .eq("code_hash", codeHash)
        .is("used_at", null)
        .select("*");
      if (error) fail("consumeCode", error);
      if (updated && updated.length === 1) {
        return { status: "consumed", code: updated[0] as CodeRecord };
      }
      const { data: existing, error: readError } = await db
        .from("oauth_authorization_codes")
        .select("*")
        .eq("code_hash", codeHash)
        .maybeSingle();
      if (readError) fail("consumeCode read", readError);
      return existing
        ? { status: "replayed", code: existing as CodeRecord }
        : { status: "missing" };
    },

    async insertTokens(tokens) {
      const { error } = await db.from("oauth_tokens").insert(tokens);
      if (error) fail("insertTokens", error);
    },

    async findToken(tokenHash) {
      const { data, error } = await db
        .from("oauth_tokens")
        .select("*")
        .eq("token_hash", tokenHash)
        .maybeSingle();
      if (error) fail("findToken", error);
      return (data as TokenRecord | null) ?? null;
    },

    async revokeToken(id, now) {
      const { data, error } = await db
        .from("oauth_tokens")
        .update({ revoked_at: now.toISOString() })
        .eq("id", id)
        .is("revoked_at", null)
        .select("id");
      if (error) fail("revokeToken", error);
      return (data?.length ?? 0) === 1;
    },

    async revokeFamily(familyId, now) {
      const { error } = await db
        .from("oauth_tokens")
        .update({ revoked_at: now.toISOString() })
        .eq("family_id", familyId)
        .is("revoked_at", null);
      if (error) fail("revokeFamily", error);
    },

    async revokeIssuedFromCode(codeHash, now) {
      const { data, error } = await db
        .from("oauth_tokens")
        .select("family_id")
        .eq("code_hash", codeHash);
      if (error) fail("revokeIssuedFromCode", error);
      const families = new Set((data ?? []).map((row) => row.family_id));
      for (const family of families) {
        await this.revokeFamily(family, now);
      }
    },

    async touchToken(id, now) {
      const { error } = await db
        .from("oauth_tokens")
        .update({ last_used_at: now.toISOString() })
        .eq("id", id);
      if (error) fail("touchToken", error);
    },

    async isOperator(userId) {
      const { data, error } = await db
        .from("app_users")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      // Fail closed, as getSessionRole does.
      if (error || !data) return false;
      return (data as { role: string }).role === "operator";
    },
  };
}

/** For tests: the same contract, in memory. */
export function memoryOAuthStore(operators: string[] = []): OAuthStore & {
  clients: Map<string, ClientRecord>;
  codes: Map<string, CodeRecord>;
  tokens: Map<string, TokenRecord>;
  operators: Set<string>;
} {
  const clients = new Map<string, ClientRecord>();
  const codes = new Map<string, CodeRecord>();
  const tokens = new Map<string, TokenRecord>();
  const operatorSet = new Set(operators);
  let nextId = 1;

  const store = {
    clients,
    codes,
    tokens,
    operators: operatorSet,
    async getClient(clientId: string) {
      return clients.get(clientId) ?? null;
    },
    async saveClient(client: ClientRecord) {
      clients.set(client.client_id, { ...client });
    },
    async insertCode(code: CodeRecord) {
      codes.set(code.code_hash, { ...code });
    },
    async consumeCode(codeHash: string, now: Date): Promise<ConsumeResult> {
      const code = codes.get(codeHash);
      if (!code) return { status: "missing" };
      if (code.used_at) return { status: "replayed", code: { ...code } };
      code.used_at = now.toISOString();
      return { status: "consumed", code: { ...code } };
    },
    async insertTokens(rows: NewToken[]) {
      for (const row of rows) {
        const id = `tok-${nextId++}`;
        tokens.set(row.token_hash, { ...row, id, revoked_at: null, last_used_at: null });
      }
    },
    async findToken(tokenHash: string) {
      const row = tokens.get(tokenHash);
      return row ? { ...row } : null;
    },
    async revokeToken(id: string, now: Date) {
      for (const row of tokens.values()) {
        if (row.id === id && row.revoked_at == null) {
          row.revoked_at = now.toISOString();
          return true;
        }
      }
      return false;
    },
    async revokeFamily(familyId: string, now: Date) {
      for (const row of tokens.values()) {
        if (row.family_id === familyId && row.revoked_at == null) {
          row.revoked_at = now.toISOString();
        }
      }
    },
    async revokeIssuedFromCode(codeHash: string, now: Date) {
      const families = new Set(
        [...tokens.values()].filter((row) => row.code_hash === codeHash).map((row) => row.family_id),
      );
      for (const family of families) await store.revokeFamily(family, now);
    },
    async touchToken(id: string, now: Date) {
      for (const row of tokens.values()) {
        if (row.id === id) row.last_used_at = now.toISOString();
      }
    },
    async isOperator(userId: string) {
      return operatorSet.has(userId);
    },
  };
  return store;
}
