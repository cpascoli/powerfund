import { describe, expect, it } from "vitest";

import { mcpWriteMode, type DeployEnv } from "./deploy";

const env = (overrides: Partial<DeployEnv>): DeployEnv => ({
  context: "",
  siteUrl: "",
  deployUrl: "",
  publicOriginOverride: "",
  mcpReadOnly: "",
  mcpAllowWrites: "",
  oauthAllowDcr: "",
  supabaseUrl: "",
  ...overrides,
});

describe("mcpWriteMode", () => {
  it("writes only in the production build by default", () => {
    expect(mcpWriteMode(env({ context: "production" }))).toEqual({ enabled: true, reason: "production" });
    for (const context of ["deploy-preview", "branch-deploy", "dev", ""]) {
      expect(mcpWriteMode(env({ context })).enabled, context || "local").toBe(false);
    }
  });

  it("lets the kill switch win over everything, production included", () => {
    expect(mcpWriteMode(env({ context: "production", mcpReadOnly: "true" }))).toEqual({
      enabled: false,
      reason: "kill_switch",
    });
    expect(mcpWriteMode(env({ mcpAllowWrites: "true", mcpReadOnly: "true" })).enabled).toBe(false);
  });

  it("honours the opt-in only on a local stack against a local database", () => {
    const LOCAL_DB = "http://127.0.0.1:54321";
    const PROD_DB = "https://vctpghpvtyabbogquuim.supabase.co";
    expect(mcpWriteMode(env({ context: "dev", mcpAllowWrites: "true", supabaseUrl: LOCAL_DB })).enabled).toBe(true);
    expect(mcpWriteMode(env({ mcpAllowWrites: "true", supabaseUrl: LOCAL_DB })).enabled).toBe(true);
    expect(mcpWriteMode(env({ context: "dev", mcpAllowWrites: "1", supabaseUrl: LOCAL_DB })).enabled).toBe(false);
    // Previews and branch deploys share production: the override cannot unlock them.
    for (const context of ["deploy-preview", "branch-deploy"]) {
      expect(mcpWriteMode(env({ context, mcpAllowWrites: "true", supabaseUrl: LOCAL_DB })).enabled, context).toBe(false);
    }
    // Nor can it unlock a local dev server pointed at the production database.
    expect(mcpWriteMode(env({ mcpAllowWrites: "true", supabaseUrl: PROD_DB })).enabled).toBe(false);
  });
});
