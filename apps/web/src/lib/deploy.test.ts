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

  it("needs an exact opt-in to write off production", () => {
    expect(mcpWriteMode(env({ context: "dev", mcpAllowWrites: "true" })).enabled).toBe(true);
    expect(mcpWriteMode(env({ context: "dev", mcpAllowWrites: "1" })).enabled).toBe(false);
    expect(mcpWriteMode(env({ context: "dev", mcpAllowWrites: "yes" })).enabled).toBe(false);
  });
});
