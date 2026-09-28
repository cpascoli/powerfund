import { AsyncLocalStorage } from "node:async_hooks";

import type { AgentPrincipal } from "./auth";

/**
 * A principal that server code has already authenticated, handed to the agent
 * route handlers in-process.
 *
 * The MCP server runs the real `/api/v1/agent/*` handlers rather than
 * re-implementing them, so scope checks, validation, idempotency and rate
 * limiting are the same code on both surfaces. It authenticates its caller
 * itself — with an OAuth access token the REST API does not accept — and then
 * needs the route to trust that result instead of looking for an agent key in
 * the Authorization header.
 *
 * AsyncLocalStorage is the channel because nothing arriving over HTTP can
 * write to it: a header could be forged by any client, a store only by code in
 * this process. `handleAgentRequest` still runs `requireScope` against the
 * injected principal, so an OAuth grant never reaches further than its scopes.
 */
const store = new AsyncLocalStorage<AgentPrincipal>();

export function runAsInternalPrincipal<T>(
  principal: AgentPrincipal,
  fn: () => Promise<T>,
): Promise<T> {
  return store.run(principal, fn);
}

export function currentInternalPrincipal(): AgentPrincipal | undefined {
  return store.getStore();
}
