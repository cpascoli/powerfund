import { describe, expect, it } from "vitest";

import {
  isMcpPath,
  isOAuthMachinePath,
  isPublicCatalogPath,
  isPublicSitePath,
  safeNextPath,
} from "./paths";

describe("public HTML routes", () => {
  it("allows the landing page, login, research, and playbook", () => {
    expect(isPublicSitePath("/")).toBe(true);
    expect(isPublicSitePath("/login")).toBe(true);
    expect(isPublicSitePath("/explore")).toBe(true);
    expect(isPublicSitePath("/explore/VRT")).toBe(true);
    expect(isPublicSitePath("/docs")).toBe(true);
    expect(isPublicSitePath("/docs/mandate")).toBe(true);
    expect(isPublicSitePath("/docs/themes")).toBe(true);
    expect(isPublicSitePath("/calendar")).toBe(true);
    expect(isPublicSitePath("/workbench")).toBe(true);
    expect(isPublicSitePath("/themes")).toBe(true);
    expect(isPublicSitePath("/mandate")).toBe(true);
  });

  it("keeps the operator cockpit, book, and build plan private", () => {
    expect(isPublicSitePath("/briefing")).toBe(false);
    expect(isPublicSitePath("/signals")).toBe(false);
    expect(isPublicSitePath("/portfolio")).toBe(false);
    expect(isPublicSitePath("/decisions")).toBe(false);
    expect(isPublicSitePath("/decisions/new")).toBe(false);
    expect(isPublicSitePath("/docs/plan")).toBe(false);
    expect(
      isPublicSitePath("/workbench", new URLSearchParams("view=risk")),
    ).toBe(false);
  });

  it("does not treat the public catalog matcher as an HTML route helper", () => {
    expect(isPublicCatalogPath("/api/v1/watchlist")).toBe(true);
    expect(isPublicSitePath("/api/v1/watchlist")).toBe(false);
  });
});

describe("MCP and OAuth routes", () => {
  it("keeps the MCP endpoint out of the anonymous public catalog", () => {
    expect(isMcpPath("/api/v1/mcp")).toBe(true);
    expect(isPublicCatalogPath("/api/v1/mcp")).toBe(false);
  });

  it("lets machine OAuth endpoints answer JSON instead of a login redirect", () => {
    for (const path of [
      "/.well-known/oauth-authorization-server",
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/api/v1/mcp",
      "/oauth/token",
      "/oauth/register",
      "/oauth/revoke",
    ]) {
      expect(isOAuthMachinePath(path), path).toBe(true);
    }
    expect(isOAuthMachinePath("/oauth/authorize")).toBe(false);
  });

  it("lets the consent page handle its own sign-in so OAuth parameters survive", () => {
    expect(isPublicSitePath("/oauth/authorize")).toBe(true);
  });

  it("only follows same-site next paths after sign-in", () => {
    expect(safeNextPath("/oauth/authorize?client_id=x")).toBe("/oauth/authorize?client_id=x");
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath(null)).toBeNull();
  });
});
