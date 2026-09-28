import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CATALOG_BEGIN, CATALOG_END, renderToolCatalog } from "./catalog";
import { POWERFUND_TOOLS } from "./tools";

const DOC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../docs/mcp-tools.md");

/**
 * docs/mcp-tools.md is what a reviewer reads to decide whether a tool is safe.
 * If it can drift from tools/list, it will. Regenerate with
 * `UPDATE_MCP_CATALOG=1 pnpm test -- catalog`.
 */
describe("docs/mcp-tools.md", () => {
  it("matches the tools the server actually serves", () => {
    const doc = readFileSync(DOC, "utf8");
    const start = doc.indexOf(CATALOG_BEGIN);
    const end = doc.indexOf(CATALOG_END);
    expect(start, "generated markers missing").toBeGreaterThanOrEqual(0);
    const generated = renderToolCatalog();
    const current = doc.slice(start, end + CATALOG_END.length);
    if (process.env.UPDATE_MCP_CATALOG === "1" && current !== generated) {
      writeFileSync(DOC, doc.slice(0, start) + generated + doc.slice(end + CATALOG_END.length));
      return;
    }
    expect(current).toBe(generated);
  });

  it("documents every tool", () => {
    const doc = readFileSync(DOC, "utf8");
    for (const tool of POWERFUND_TOOLS) expect(doc).toContain(`\`${tool.name}\``);
  });
});
