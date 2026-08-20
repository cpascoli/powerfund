import { describe, expect, it } from "vitest";

import { isAgentApiPath, isPublicCatalogPath } from "../paths";
import { agentOpenApiDocument } from "./openapi";
import { openApiDocument } from "../v1/openapi";
import { HELD_RESOURCES, PUBLIC_RESOURCES } from "../v1/resources";

describe("API surfaces", () => {
  it("keeps the public catalog anonymous and excludes the agent namespace", () => {
    expect(isPublicCatalogPath("/api/v1/portfolio")).toBe(true);
    expect(isPublicCatalogPath("/api/v1/agent/state")).toBe(false);
    expect(isAgentApiPath("/api/v1/agent/state")).toBe(true);
    expect(isAgentApiPath("/api/v1/journal")).toBe(false);
  });

  it("does not publish the deployment queue or agent routes on the public catalog", () => {
    expect(PUBLIC_RESOURCES.some((row) => row.path.includes("/agent"))).toBe(
      false,
    );
    expect(HELD_RESOURCES.some((row) => row.path === "/api/v1/planned")).toBe(
      true,
    );
  });

  it("keeps public OpenAPI operationIds distinct from agent tools", () => {
    const publicDoc = openApiDocument("https://example.test");
    const agentDoc = agentOpenApiDocument("https://example.test");
    expect(publicDoc.paths["/api/v1/portfolio"].get.operationId).toBe(
      "getPortfolio",
    );
    expect(agentDoc.paths["/api/v1/agent/portfolio"].get.operationId).toBe(
      "getPortfolio",
    );
    expect(agentDoc.paths["/api/v1/agent/state"].get.operationId).toBe(
      "getFundState",
    );
    expect(agentDoc.paths["/api/v1/agent/companies/{symbol}/dossier"].patch.operationId).toBe(
      "updateDossier",
    );
    expect(
      Object.prototype.hasOwnProperty.call(publicDoc.paths, "/api/v1/agent/state"),
    ).toBe(false);
    expect(JSON.stringify(publicDoc)).not.toContain("quantity");
    expect(JSON.stringify(publicDoc)).not.toContain("planned_usd");
  });
});
