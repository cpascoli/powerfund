import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { agentOpenApiDocument, agentOperations } from "@/lib/api/agent/openapi";

import { AGENT_OPERATION_EXPOSURE } from "./exposure";
import { POWERFUND_TOOLS } from "./tools";

const AGENT_ROUTES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../app/api/v1/agent");

/**
 * Operation ids declared by the route handlers themselves. Read from source
 * rather than from the OpenAPI document, so an operation that was never
 * documented still has to be classified.
 */
function routeOperationIds(dir = AGENT_ROUTES): string[] {
  const ids: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) ids.push(...routeOperationIds(full));
    else if (entry === "route.ts") {
      for (const match of readFileSync(full, "utf8").matchAll(/operationId:\s*"(\w+)"/g)) {
        ids.push(match[1]!);
      }
    }
  }
  return ids;
}

function openApiOperationIds(): string[] {
  const doc = agentOpenApiDocument("https://example.test");
  return Object.values(doc.paths).flatMap((item) =>
    Object.values(item as Record<string, { operationId?: string }>)
      .map((op) => op?.operationId)
      .filter((id): id is string => Boolean(id)),
  );
}

const covered = new Set(POWERFUND_TOOLS.flatMap((tool) => tool.operations));

describe("MCP exposure manifest", () => {
  it("finds the route operations it checks (guards a hollow pass)", () => {
    expect(routeOperationIds().length).toBeGreaterThanOrEqual(20);
  });

  it("classifies every agent operation, from the routes and the OpenAPI document", () => {
    for (const id of new Set([...routeOperationIds(), ...openApiOperationIds()])) {
      expect(AGENT_OPERATION_EXPOSURE[id], `${id} is not classified in exposure.ts`).toBeDefined();
    }
  });

  // The HTTP index is derived from the OpenAPI document (agentOperations), so
  // this is what keeps a new route from shipping undocumented and unindexed.
  it("documents every route operation in OpenAPI, and so in the HTTP index", () => {
    const listed = new Set(agentOperations("https://example.test").map((row) => row.operationId));
    for (const id of routeOperationIds()) {
      if (id === "getAgentIndex") continue;
      expect(listed, `${id} is missing from the OpenAPI document`).toContain(id);
    }
    expect([...listed].sort()).toEqual([...new Set(openApiOperationIds())].sort());
  });

  it("does not classify operations that no longer exist", () => {
    const real = new Set(routeOperationIds());
    for (const id of Object.keys(AGENT_OPERATION_EXPOSURE)) expect(real, id).toContain(id);
  });

  it("gives every exposed operation a tool", () => {
    for (const [id, exposure] of Object.entries(AGENT_OPERATION_EXPOSURE)) {
      if (exposure.mcp === "exposed") expect(covered, `${id} is exposed but no tool calls it`).toContain(id);
    }
  });

  it("never lets a tool reach an excluded operation, and requires a reason for each exclusion", () => {
    for (const [id, exposure] of Object.entries(AGENT_OPERATION_EXPOSURE)) {
      if (exposure.mcp !== "excluded") continue;
      expect(exposure.reason.length, id).toBeGreaterThan(20);
      expect(covered, `${id} is excluded but a tool calls it`).not.toContain(id);
    }
  });

  it("only lets tools call classified operations", () => {
    for (const id of covered) expect(AGENT_OPERATION_EXPOSURE[id]?.mcp, id).toBe("exposed");
  });
});
