import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { POWERFUND_TOOLS } from "./tools";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const PLUGIN = path.join(ROOT, "plugins/powerfund");
const read = (file: string) => readFileSync(path.join(PLUGIN, file), "utf8");
const TOOL_NAMES = new Set(POWERFUND_TOOLS.map((tool) => tool.name));

/** Backticked snake_case identifiers that look like tool names. */
function mentionedTools(text: string): string[] {
  const candidates = [...text.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)].map((match) => match[1]!);
  const verbs = /^(get|list|update|record|create|complete|add|set)_/;
  return [...new Set(candidates.filter((name) => verbs.test(name)))];
}

describe("PowerFund plugin package", () => {
  it("points mcp.json at the production MCP endpoint and carries no credentials", () => {
    const mcp = JSON.parse(read("mcp.json"));
    expect(Object.keys(mcp.mcpServers)).toEqual(["powerfund"]);
    expect(mcp.mcpServers.powerfund).toEqual({
      type: "streamable-http",
      url: "https://powerfund.netlify.app/api/v1/mcp",
    });
    expect(JSON.stringify(mcp)).not.toMatch(/bearer|token|secret|authorization|pf_|pfat_/i);
  });

  it("has a valid manifest name and no secrets", () => {
    const plugin = JSON.parse(read("plugin.json"));
    expect(plugin.name).toMatch(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/);
    expect(plugin.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(JSON.stringify(plugin)).not.toMatch(/bearer|secret|pf_|pfat_/i);
  });

  it("gives the skill the front matter a skill needs", () => {
    const skill = read("skills/powerfund/SKILL.md");
    const front = /^---\n([\s\S]*?)\n---/.exec(skill)?.[1] ?? "";
    expect(front).toMatch(/^name: powerfund$/m);
    expect(front).toMatch(/^description: .{80,}$/m);
  });

  it("only tells the model to use tools that exist", () => {
    for (const file of ["skills/powerfund/SKILL.md", "skills/powerfund/references/tool-map.md"]) {
      // Guard against a hollow pass: a regex that matched nothing would
      // report no unknown tools too.
      expect(mentionedTools(read(file)).length, file).toBeGreaterThan(15);
      const unknown = mentionedTools(read(file)).filter((name) => !TOOL_NAMES.has(name));
      expect(unknown, file).toEqual([]);
    }
  });

  it("maps every tool in the reference the skill tells the model to consult", () => {
    const map = read("skills/powerfund/references/tool-map.md");
    for (const name of TOOL_NAMES) expect(map, name).toContain(`\`${name}\``);
  });

  it("keeps the approval rule covering every write tool", () => {
    const skill = read("skills/powerfund/SKILL.md");
    const rule = skill.slice(skill.indexOf("**Approval before every write.**"), skill.indexOf("**Analysis prompts"));
    for (const tool of POWERFUND_TOOLS.filter((row) => !row.annotations.readOnlyHint)) {
      expect(rule, tool.name).toContain(`\`${tool.name}\``);
    }
  });
});
