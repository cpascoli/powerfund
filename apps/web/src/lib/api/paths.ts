export function isAgentApiPath(pathname: string): boolean {
  return pathname === "/api/v1/agent" || pathname.startsWith("/api/v1/agent/");
}

/** Authenticates with its own Bearer / OAuth check inside the handler. */
export function isMcpPath(pathname: string): boolean {
  return pathname === "/api/v1/mcp" || pathname.startsWith("/api/v1/mcp/");
}

/**
 * Machine-facing OAuth endpoints and discovery documents. They must answer
 * clients with JSON, never with a redirect to /login. The authorize page is
 * not here: it is a browser page that needs the operator's session.
 */
export function isOAuthMachinePath(pathname: string): boolean {
  if (pathname.startsWith("/.well-known/oauth-")) return true;
  return (
    pathname === "/oauth/token" ||
    pathname === "/oauth/register" ||
    pathname === "/oauth/revoke"
  );
}

export function isPublicCatalogPath(pathname: string): boolean {
  if (pathname === "/llms.txt") return true;
  if (pathname === "/api/v1/agent/openapi.json") return true;
  if (isAgentApiPath(pathname) || isMcpPath(pathname)) return false;
  return pathname === "/api/v1" || pathname.startsWith("/api/v1/");
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * HTML routes that anonymous visitors may load. Operator surfaces (briefing,
 * book, journal, signals, workbench risk, build plan) stay authenticated.
 */
export function isPublicSitePath(
  pathname: string,
  searchParams?: Pick<URLSearchParams, "get">,
): boolean {
  if (pathname === "/" || pathname === "/login") return true;
  // Reachable signed out so the page itself can send the operator to /login
  // with a `next` that keeps the OAuth parameters. The middleware's redirect
  // would drop the query string. The page refuses anyone but the operator.
  if (pathname === "/oauth/authorize") return true;
  if (pathname === "/themes" || pathname === "/mandate") return true;
  if (matchesPrefix(pathname, "/explore")) return true;
  if (matchesPrefix(pathname, "/calendar")) return true;
  // Operator-only Playbook docs (`operatorOnly` in lib/docs.ts). Listed here
  // rather than imported: the middleware must not pull in node:fs.
  if (matchesPrefix(pathname, "/docs/plan")) return false;
  if (matchesPrefix(pathname, "/docs/gpt-agent-process")) return false;
  if (matchesPrefix(pathname, "/docs")) return true;
  if (pathname === "/workbench") {
    return searchParams?.get("view") !== "risk";
  }
  return false;
}

/**
 * Where to go after signing in. Only a same-site path: an absolute or
 * protocol-relative `next` would turn the login page into an open redirect.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return null;
  }
  return next;
}
