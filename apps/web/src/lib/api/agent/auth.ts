import { timingSafeEqual } from "node:crypto";

import {
  AgentApiError,
  permissionDenied,
  unauthenticated,
} from "./errors";
import {
  isAgentScope,
  scopesForRole,
  type AgentScope,
} from "./scopes";

export type AgentPrincipal = {
  name: string;
  scopes: readonly AgentScope[];
};

export type AgentKeyConfig = {
  name: string;
  secret: string;
  scopes: AgentScope[];
};

function asRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function configError(message: string): AgentApiError {
  return new AgentApiError(500, "AGENT_KEYS_INVALID", message);
}

function parseKeyEntry(value: unknown, index: number): AgentKeyConfig {
  if (!asRecord(value)) {
    throw configError(`POWERFUND_AGENT_API_KEYS[${index}] must be an object.`);
  }
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const secret = typeof value.secret === "string" ? value.secret : "";
  if (!name) {
    throw configError(`POWERFUND_AGENT_API_KEYS[${index}].name is required.`);
  }
  if (secret.length < 16) {
    throw configError(
      `POWERFUND_AGENT_API_KEYS[${index}].secret must be at least 16 characters.`,
    );
  }

  let scopes: AgentScope[] = [];
  if (Array.isArray(value.scopes)) {
    for (const scope of value.scopes) {
      if (typeof scope !== "string" || !isAgentScope(scope)) {
        throw configError(
          `POWERFUND_AGENT_API_KEYS[${index}] has an unknown scope.`,
        );
      }
      scopes.push(scope);
    }
  } else if (value.role === "read" || value.role === "write") {
    scopes = scopesForRole(value.role);
  } else {
    throw configError(
      `POWERFUND_AGENT_API_KEYS[${index}] needs a role of "read" or "write", or an explicit scopes array.`,
    );
  }

  return { name, secret, scopes };
}

export function parseAgentKeys(raw: string | undefined): AgentKeyConfig[] {
  if (raw == null || raw.trim().length === 0) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw configError("POWERFUND_AGENT_API_KEYS must be valid JSON.");
  }
  if (!Array.isArray(parsed)) {
    throw configError("POWERFUND_AGENT_API_KEYS must be a JSON array.");
  }
  return parsed.map(parseKeyEntry);
}

function secretsEqual(left: string, right: string): boolean {
  const leftBuf = Buffer.from(left);
  const rightBuf = Buffer.from(right);
  if (leftBuf.length !== rightBuf.length) {
    return false;
  }
  return timingSafeEqual(leftBuf, rightBuf);
}

export function authenticateAgent(
  request: Request,
  rawKeys = process.env.POWERFUND_AGENT_API_KEYS,
): AgentPrincipal {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)/i.exec(header);
  const token = match?.[1] ?? "";
  if (!token) {
    throw unauthenticated("Missing Authorization: Bearer token.");
  }

  const keys = parseAgentKeys(rawKeys);
  if (keys.length === 0) {
    throw unauthenticated("Agent API keys are not configured.");
  }

  const matched = keys.find((key) => secretsEqual(key.secret, token));
  if (!matched) {
    throw unauthenticated("Invalid agent token.");
  }

  return { name: matched.name, scopes: matched.scopes };
}

export function requireScope(
  principal: AgentPrincipal,
  scope: AgentScope,
): void {
  if (!principal.scopes.includes(scope)) {
    throw permissionDenied(scope);
  }
}
