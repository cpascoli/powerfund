export const AGENT_SCOPES = [
  "powerfund:state:read",
  "powerfund:portfolio:read",
  "powerfund:dossier:read",
  "powerfund:dossier:write",
  "powerfund:journal:read",
  "powerfund:journal:append",
  "powerfund:deployment:read",
  "powerfund:deployment:write",
  "powerfund:reviews:read",
  "powerfund:reviews:write",
] as const;

export type AgentScope = (typeof AGENT_SCOPES)[number];

export const READ_SCOPES: readonly AgentScope[] = [
  "powerfund:state:read",
  "powerfund:portfolio:read",
  "powerfund:dossier:read",
  "powerfund:journal:read",
  "powerfund:deployment:read",
  "powerfund:reviews:read",
] as const;

export const WRITE_SCOPES: readonly AgentScope[] = [
  ...READ_SCOPES,
  "powerfund:dossier:write",
  "powerfund:journal:append",
  "powerfund:deployment:write",
  "powerfund:reviews:write",
] as const;

const SCOPE_SET = new Set<string>(AGENT_SCOPES);

export function isAgentScope(value: string): value is AgentScope {
  return SCOPE_SET.has(value);
}

export function scopesForRole(role: "read" | "write"): AgentScope[] {
  return role === "write" ? [...WRITE_SCOPES] : [...READ_SCOPES];
}
