import { describe, expect, it } from "vitest";

import { isPublicCatalogPath, isPublicSitePath } from "./paths";

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
