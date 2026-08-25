export function isAgentApiPath(pathname: string): boolean {
  return pathname === "/api/v1/agent" || pathname.startsWith("/api/v1/agent/");
}

export function isPublicCatalogPath(pathname: string): boolean {
  if (pathname === "/llms.txt") return true;
  if (pathname === "/api/v1/agent/openapi.json") return true;
  if (isAgentApiPath(pathname)) return false;
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
  if (pathname === "/themes" || pathname === "/mandate") return true;
  if (matchesPrefix(pathname, "/explore")) return true;
  if (matchesPrefix(pathname, "/calendar")) return true;
  if (matchesPrefix(pathname, "/docs/plan")) return false;
  if (matchesPrefix(pathname, "/docs")) return true;
  if (pathname === "/workbench") {
    return searchParams?.get("view") !== "risk";
  }
  return false;
}
