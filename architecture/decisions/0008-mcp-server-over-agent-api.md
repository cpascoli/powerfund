# ADR 0008: MCP server over the agent API, with PowerFund as its own OAuth server

## Status

Accepted (28 September 2026)

## Context

OpenAI is retiring custom GPTs. Migrating PowerFundAgent to a plugin carries its
instructions and knowledge, but not its Actions, which are its only access to the
book. The replacement is an MCP server. ChatGPT connects to MCP servers with
OAuth or with no auth; it cannot send the agent API's static keys. The REST agent
API must keep serving the GPT unchanged throughout.

## Decision

- **Host the MCP server in the Next app** at `/api/v1/mcp`, not as a separate
  Netlify Function. It needs the same Supabase client and route handlers, and it
  deploys with them.
- **Call the agent route handlers in-process** (`InProcessAgentClient`), with the
  authenticated principal passed through `AsyncLocalStorage`. REST's validation,
  scope checks, idempotency and attribution are reused rather than reimplemented,
  and no HTTP loopback or server-held key is needed. Plain HTTP to
  `/api/v1/agent/*` still requires an agent key.
- **Goal-named tools** (22), not one per route: reads separate from writes, one
  REST write per write tool, one read-only composite (`get_review_context`).
- **Stateless Streamable HTTP, JSON responses**, on MCP TypeScript SDK **v2**
  (`@modelcontextprotocol/server`). It serves 2025-era clients and the
  2026-07-28 stateless revision from one server definition.
- **PowerFund is its own OAuth 2.1 authorization server** (CIMD + DCR, PKCE S256,
  RFC 8707 resource binding, RFC 9207 `iss`, hashed opaque tokens, rotating
  refresh). Consent requires the operator's Supabase session. Scopes are the
  agent API's existing scope strings.

## Consequences

- Nothing about the REST API changes for its clients. It remains the fallback
  after the GPT is retired.
- A new agent operation needs a tool. `tools.test.ts` fails until one exists, and
  `catalog.test.ts` fails until `docs/mcp-tools.md` is regenerated.
- The authorization server is ours to maintain. Supabase's OAuth server was
  rejected for now (beta, no CIMD, no resource-bound audience); swapping it in
  later only changes `verifyAccessToken`.
- Deploy previews share the production database, so MCP writes run only in the
  production build, from Netlify build values no request can influence. Tokens
  are resource-bound so a preview's never works in production.
- MCP reads never write: review triggers are previewed, and latched after each
  bars ingest instead, since a price condition can stop being true.
- The exposed surface is an explicit manifest (`lib/mcp/exposure.ts`), not
  "every route is a tool".
- Follow-ups: `private_key_jwt` client authentication, a grants page for the
  operator, and output schemas once responses are typed.

Details: [docs/mcp-architecture.md](../../docs/mcp-architecture.md).
