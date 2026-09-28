import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { POWERFUND_TOOLS } from "./tools";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");

type Case = {
  id: string;
  category: string;
  prompt: string;
  first?: string;
  expect: string[];
  allow: string[];
  forbid?: string[];
  writes: "none" | "after_approval";
  pass_if: string;
};

const suite = JSON.parse(readFileSync(path.join(ROOT, "evals/mcp/cases.json"), "utf8")) as {
  cases: Case[];
};
const tools = new Map(POWERFUND_TOOLS.map((tool) => [tool.name, tool]));
const isWrite = (name: string) => tools.get(name)?.annotations.readOnlyHint === false;

/**
 * The regression suite is scored by a person today, so nothing runs it. What
 * can rot silently is its vocabulary: a renamed tool would leave cases that
 * no run can ever satisfy.
 */
describe("evals/mcp/cases.json", () => {
  it("names only tools that exist", () => {
    for (const row of suite.cases) {
      for (const name of [row.first, ...row.expect, ...row.allow, ...(row.forbid ?? [])]) {
        if (name) expect(tools.has(name), `${row.id}: ${name}`).toBe(true);
      }
    }
  });

  it("never expects or allows a write in a case that must not write", () => {
    for (const row of suite.cases.filter((c) => c.writes === "none")) {
      const writes = [row.first, ...row.expect, ...row.allow].filter((name) => name && isWrite(name));
      expect(writes, row.id).toEqual([]);
    }
  });

  it("has unique ids, and a first tool that is also expected", () => {
    const ids = suite.cases.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const row of suite.cases) {
      if (row.first) expect(row.expect, row.id).toContain(row.first);
    }
  });

  it("covers every category the migration brief asks for", () => {
    const categories = new Set(suite.cases.map((row) => row.category));
    for (const needed of ["read", "multi", "no-write", "write", "complex", "invalid", "ambiguous"]) {
      expect(categories, needed).toContain(needed);
    }
  });

  it("exercises every read tool somewhere and the commonest writes", () => {
    const named = new Set(suite.cases.flatMap((row) => [...row.expect, ...row.allow]));
    for (const tool of POWERFUND_TOOLS.filter((row) => row.annotations.readOnlyHint)) {
      expect(named, tool.name).toContain(tool.name);
    }
    for (const write of ["update_dossier", "record_decision", "complete_review_task", "create_review_task"]) {
      expect(named, write).toContain(write);
    }
  });
});
