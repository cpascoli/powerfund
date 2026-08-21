import { describe, expect, it } from "vitest";

import { isAgentApiPath, isPublicCatalogPath } from "../paths";
import { agentOpenApiDocument, GPT_ACTION_TEXT_MAX } from "./openapi";
import { openApiDocument } from "../v1/openapi";
import { HELD_RESOURCES, PUBLIC_RESOURCES } from "../v1/resources";

type OpenApiOp = {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: Array<{ name: string; description?: string }>;
  requestBody?: {
    content?: {
      "application/json"?: { schema?: unknown };
    };
  };
};

function operations(doc: ReturnType<typeof agentOpenApiDocument>) {
  const rows: Array<{ path: string; method: string; op: OpenApiOp }> = [];
  for (const [path, item] of Object.entries(doc.paths)) {
    const record = item as Record<string, OpenApiOp | undefined>;
    for (const method of ["get", "post", "patch"] as const) {
      const op = record[method];
      if (op) rows.push({ path, method, op });
    }
  }
  return rows;
}

describe("API surfaces", () => {
  it("keeps the public catalog anonymous and excludes private agent routes", () => {
    expect(isPublicCatalogPath("/api/v1/portfolio")).toBe(true);
    expect(isPublicCatalogPath("/api/v1/agent/state")).toBe(false);
    expect(isPublicCatalogPath("/api/v1/agent/openapi.json")).toBe(true);
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
    expect(HELD_RESOURCES.some((row) => row.path === "/api/v1/reviews")).toBe(
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
    expect(agentDoc.paths["/api/v1/agent/review-queue"].get.operationId).toBe(
      "getReviewQueue",
    );
    expect(
      agentDoc.paths["/api/v1/agent/review-tasks/{id}/complete"].post.operationId,
    ).toBe("completeReviewTask");
    expect(agentDoc.paths["/api/v1/agent/watchlist"].post.operationId).toBe(
      "addWatchlistCompany",
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

  it("is shaped for ChatGPT Actions URL import", () => {
    const agentDoc = agentOpenApiDocument("https://example.test");
    expect(agentDoc.openapi).toBe("3.1.0");
    expect(agentDoc.components.schemas).toEqual({ JsonObject: expect.any(Object) });
    const raw = JSON.stringify(agentDoc);
    expect(raw).not.toMatch(/"oneOf"/);
    expect(raw).not.toMatch(/"anyOf"/);
    expect(raw).not.toMatch(/"allOf"/);
    expect(raw).not.toMatch(/"\$ref"/);

    function assertObjectSchemasHaveProperties(node: unknown, path: string) {
      if (node == null || typeof node !== "object") return;
      if (Array.isArray(node)) {
        node.forEach((item, index) =>
          assertObjectSchemasHaveProperties(item, `${path}[${index}]`),
        );
        return;
      }
      const rec = node as Record<string, unknown>;
      if (rec.type === "object") {
        expect(rec.properties, path).toBeTypeOf("object");
      }
      for (const [key, value] of Object.entries(rec)) {
        assertObjectSchemasHaveProperties(value, `${path}.${key}`);
      }
    }
    assertObjectSchemasHaveProperties(agentDoc, "openapi");

    const ops = operations(agentDoc);
    expect(ops.length).toBeGreaterThan(8);
    for (const { path, method, op } of ops) {
      expect(op.operationId, `${method} ${path}`).toMatch(/^[a-zA-Z][a-zA-Z0-9]+$/);
      expect((op.summary ?? "").length, `${op.operationId} summary`).toBeLessThanOrEqual(
        GPT_ACTION_TEXT_MAX,
      );
      expect(
        (op.description ?? "").length,
        `${op.operationId} description`,
      ).toBeLessThanOrEqual(GPT_ACTION_TEXT_MAX);
    }

    const createBody = agentDoc.paths["/api/v1/agent/review-tasks"].post
      .requestBody as Record<string, any>;
    const createReview =
      createBody.content["application/json"].schema.properties.trigger;
    expect(createReview.properties.type.enum).toEqual([
      "scheduled",
      "event_window",
      "condition",
    ]);
    expect(createReview.properties.at.format).toBe("date-time");
    expect(createReview.example).toEqual({
      type: "scheduled",
      at: "2026-08-22T00:00:00Z",
    });
    const plannedBody = agentDoc.paths["/api/v1/agent/planned-actions"].post
      .requestBody as Record<string, any>;
    expect(plannedBody.content["application/json"].schema.required).toEqual([
      "symbol",
      "action_type",
    ]);

    const createResponses = agentDoc.paths["/api/v1/agent/review-tasks"].post
      .responses as Record<string, any>;
    expect(
      createResponses["200"].content["application/json"].schema.properties
        .created.type,
    ).toBe("boolean");
    expect(
      createResponses["200"].content["application/json"].schema.properties
        .review_task.properties.id.type,
    ).toBe("string");
    expect(Object.keys(createResponses["200"].content["application/json"].schema.properties)).toEqual(
      ["created", "review_task"],
    );

    const addWatchlist =
      agentDoc.paths["/api/v1/agent/watchlist"].post.requestBody as Record<
        string,
        any
      >;
    expect(addWatchlist.content["application/json"].schema.required).toEqual([
      "symbol",
      "name",
      "theme",
    ]);
    const addWatchlistResponses = agentDoc.paths["/api/v1/agent/watchlist"].post
      .responses as Record<string, any>;
    expect(
      Object.keys(
        addWatchlistResponses["200"].content["application/json"].schema.properties,
      ),
    ).toEqual(["created", "company"]);
  });
});
