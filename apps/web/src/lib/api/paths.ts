export function isAgentApiPath(pathname: string): boolean {
  return pathname === "/api/v1/agent" || pathname.startsWith("/api/v1/agent/");
}

export function isPublicCatalogPath(pathname: string): boolean {
  if (pathname === "/llms.txt") return true;
  if (isAgentApiPath(pathname)) return false;
  return pathname === "/api/v1" || pathname.startsWith("/api/v1/");
}
