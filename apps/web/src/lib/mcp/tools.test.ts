import {
  DECISION_QUALITY_GRADES,
  DECISION_THESIS_GRADES,
  DECISION_TYPES as DOMAIN_DECISION_TYPES,
  DOSSIER_STATUSES as DOMAIN_DOSSIER_STATUSES,
  PLANNED_ACTION_TYPES as DOMAIN_PLANNED_ACTION_TYPES,
  REVIEW_OUTPUT_KINDS as DOMAIN_REVIEW_OUTPUT_KINDS,
  REVIEW_TASK_PRIORITIES,
  REVIEW_TASK_SCOPES,
} from "@powerfund/domain";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { agentOpenApiDocument } from "@/lib/api/agent/openapi";
import { AGENT_SCOPES } from "@/lib/api/agent/scopes";

import {
  DECISION_TYPES,
  DOSSIER_STATUSES,
  PLANNED_ACTION_TYPES,
  QUALITY_GRADES,
  REVIEW_OUTPUT_KINDS,
  REVIEW_PRIORITIES,
  REVIEW_SCOPES,
  THESIS_GRADES,
} from "./schemas";
import { fakeAgentClient, WRITE_METHODS } from "./testing";
import { POWERFUND_TOOLS, type PowerFundTool } from "./tools";

const DECISION_ID = "0b6b1b52-6a8e-4d7e-9d8f-8e2f3c4a5b61";
const TASK_ID = "5e7d8c3a-1f2b-4c6d-8e9f-0a1b2c3d4e5f";
const PLAN_ID = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d";

/** Minimal valid arguments per tool, used to exercise every handler. */
const SAMPLE_ARGS: Record<string, Record<string, unknown>> = {
  get_fund_state: {},
  get_portfolio: {},
  get_performance: { from: "2026-09-01" },
  get_research_inbox: { kinds: ["diligence"] },
  get_review_context: { symbol: "SNDK" },
  get_dossier: { symbol: "SNDK" },
  list_dossier_versions: { symbol: "SNDK" },
  get_dossier_version: { symbol: "SNDK", version: "3" },
  get_journal: { symbol: "MRCY", horizon_due: true },
  get_calibration_status: {},
  list_planned_actions: {},
  list_reviews: { status: ["due"] },
  update_dossier: {
    symbol: "SNDK",
    expected_version: 3,
    change_reason: "Q3 re-underwrite",
    changes: { thesis: "t" },
  },
  record_decision: { symbol: "VRT", decision_type: "hold", thesis: "Intact." },
  record_decision_outcome: {
    decision_id: DECISION_ID,
    horizon_days: 30,
    thesis_grade: "correct",
    lessons: "l",
  },
  create_planned_action: {
    symbol: "KTOS",
    action_type: "buy",
    planned_usd: 5000,
    rationale: "Starter.",
  },
  update_planned_action: { planned_action_id: PLAN_ID, status: "deferred" },
  create_review_task: {
    title: "MRCY print",
    instructions: "Check backlog.",
    scope: "company",
    symbols: ["MRCY"],
    trigger: { type: "event_window", not_before: "2026-10-28T00:00:00Z", due_by: "2026-11-08T00:00:00Z" },
  },
  update_review_task: { review_task_id: TASK_ID, instructions: "More." },
  complete_review_task: { review_task_id: TASK_ID, outcome: "Held." },
  add_watchlist_company: { symbol: "HII", name: "Huntington Ingalls", theme: "defence" },
  set_watchlist_archived: { symbol: "HII", archived: true },
};

function parse(tool: PowerFundTool, args: unknown) {
  return z.strictObject(tool.inputSchema).safeParse(args);
}

async function run(tool: PowerFundTool, args: Record<string, unknown>) {
  const client = fakeAgentClient();
  const parsed = parse(tool, args);
  if (!parsed.success) throw new Error(`${tool.name}: ${parsed.error.message}`);
  await tool.handler(parsed.data, { client, write: { idempotencyKey: "k" } });
  return client.calls;
}

describe("MCP tool catalog", () => {
  it("has unique snake_case names and a sample for every tool", () => {
    const names = POWERFUND_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^[a-z][a-z0-9_]{2,63}$/);
      expect(SAMPLE_ARGS[name], `sample args for ${name}`).toBeDefined();
    }
  });

  it("describes when to use each tool, not which HTTP route it calls", () => {
    for (const tool of POWERFUND_TOOLS) {
      expect(tool.title.length).toBeGreaterThan(5);
      expect(tool.description.length).toBeGreaterThan(80);
      expect(tool.description).not.toMatch(/\b(GET|POST|PATCH)\s+\//);
      expect(tool.description).not.toMatch(/\/api\/v1/);
    }
  });

  it("only requires scopes the agent API defines", () => {
    for (const tool of POWERFUND_TOOLS) {
      expect(tool.scopes.length).toBeGreaterThan(0);
      for (const scope of tool.scopes) {
        expect(AGENT_SCOPES).toContain(scope);
      }
    }
  });

  it("keeps annotations honest: reads are read-only, writes are not", () => {
    for (const tool of POWERFUND_TOOLS) {
      expect(tool.annotations.openWorldHint).toBe(false);
      if (tool.annotations.readOnlyHint) {
        expect(tool.annotations.destructiveHint).toBe(false);
        expect(tool.scopes.every((scope) => scope.endsWith(":read"))).toBe(true);
      } else {
        expect(tool.scopes.some((scope) => !scope.endsWith(":read"))).toBe(true);
      }
    }
  });

  it("asks every queue-reading tool for preview evaluation, which never writes", async () => {
    for (const name of ["get_fund_state", "list_reviews"]) {
      const tool = POWERFUND_TOOLS.find((row) => row.name === name)!;
      const calls = await run(tool, SAMPLE_ARGS[name]!);
      expect(calls[0]!.args[0], name).toMatchObject({ evaluate: "preview" });
    }
  });

  it("never lets a read-only tool reach a write operation", async () => {
    for (const tool of POWERFUND_TOOLS.filter((row) => row.annotations.readOnlyHint)) {
      const calls = await run(tool, SAMPLE_ARGS[tool.name]!);
      const writes = calls.filter((call) =>
        (WRITE_METHODS as readonly string[]).includes(call.method),
      );
      expect(writes, tool.name).toEqual([]);
    }
  });

  it("makes each write tool exactly one write, carrying the idempotency key", async () => {
    for (const tool of POWERFUND_TOOLS.filter((row) => !row.annotations.readOnlyHint)) {
      const calls = await run(tool, SAMPLE_ARGS[tool.name]!);
      expect(calls, tool.name).toHaveLength(1);
      expect(tool.operations).toEqual([calls[0]!.method]);
      expect(calls[0]!.write?.idempotencyKey).toBe("k");
    }
  });

  it("marks withdrawing or overwriting writes destructive, appends not", () => {
    const destructive = POWERFUND_TOOLS.filter((tool) => tool.annotations.destructiveHint).map(
      (tool) => tool.name,
    );
    expect(destructive.sort()).toEqual(
      ["set_watchlist_archived", "update_dossier", "update_planned_action", "update_review_task"].sort(),
    );
  });

  it("offers no path to fills, cash, transactions or SQL", () => {
    const text = POWERFUND_TOOLS.map((tool) => `${tool.name} ${Object.keys(tool.inputSchema).join(" ")}`).join(" ");
    expect(text).not.toMatch(/transaction|book_fill|bookfill|cash_movement|confirm|sql|mandate_override/i);
  });
});

describe("MCP enums match the domain", () => {
  it.each([
    ["decision types", DECISION_TYPES, DOMAIN_DECISION_TYPES],
    ["planned action types", PLANNED_ACTION_TYPES, DOMAIN_PLANNED_ACTION_TYPES],
    ["review scopes", REVIEW_SCOPES, REVIEW_TASK_SCOPES],
    ["review priorities", REVIEW_PRIORITIES, REVIEW_TASK_PRIORITIES],
    ["review output kinds", REVIEW_OUTPUT_KINDS, DOMAIN_REVIEW_OUTPUT_KINDS],
    ["thesis grades", THESIS_GRADES, DECISION_THESIS_GRADES],
    ["quality grades", QUALITY_GRADES, DECISION_QUALITY_GRADES],
    ["dossier statuses", DOSSIER_STATUSES, DOMAIN_DOSSIER_STATUSES],
  ])("%s", (_label, mcp, domain) => {
    expect([...mcp].sort()).toEqual([...domain].sort());
  });
});

describe("tool input schemas", () => {
  const byName = new Map(POWERFUND_TOOLS.map((tool) => [tool.name, tool]));
  const tool = (name: string) => byName.get(name)!;

  it("accepts every sample", () => {
    for (const row of POWERFUND_TOOLS) {
      expect(parse(row, SAMPLE_ARGS[row.name]).success, row.name).toBe(true);
    }
  });

  it("requires horizon_days on a grade, but accepts an explicit null", () => {
    const base = { decision_id: DECISION_ID, thesis_grade: "correct", lessons: "l" };
    expect(parse(tool("record_decision_outcome"), base).success).toBe(false);
    expect(parse(tool("record_decision_outcome"), { ...base, horizon_days: null }).success).toBe(true);
    expect(parse(tool("record_decision_outcome"), { ...base, horizon_days: 60 }).success).toBe(false);
  });

  it("refuses arguments a tool does not define", () => {
    expect(
      parse(tool("create_planned_action"), {
        ...SAMPLE_ARGS.create_planned_action,
        mandate_override_reason: "because",
      }).success,
    ).toBe(false);
  });

  it("accepts a dossier version as a number or a string", async () => {
    const version = tool("get_dossier_version");
    expect(parse(version, { symbol: "SNDK", version: 3 }).success).toBe(true);
    expect(parse(version, { symbol: "SNDK", version: "3" }).success).toBe(true);
    const calls = await run(version, { symbol: "SNDK", version: 3 });
    expect(calls[0]!.args).toEqual(["SNDK", "3"]);
  });

  it("refuses a guessed id that is not a UUID", () => {
    expect(
      parse(tool("complete_review_task"), { review_task_id: "task-1", outcome: "x" }).success,
    ).toBe(false);
  });

  it("refuses unknown dossier fields instead of dropping them", () => {
    const result = parse(tool("update_dossier"), {
      ...SAMPLE_ARGS.update_dossier,
      changes: { thesis: "t", target_price: 300 },
    });
    expect(result.success).toBe(false);
  });

  it("requires expected_version, with null reserved for a first dossier", () => {
    const { expected_version: _omit, ...rest } = SAMPLE_ARGS.update_dossier!;
    expect(parse(tool("update_dossier"), rest).success).toBe(false);
    expect(parse(tool("update_dossier"), { ...rest, expected_version: null }).success).toBe(true);
  });

  it("validates each trigger shape", () => {
    const create = tool("create_review_task");
    const base = { title: "t", instructions: "i", scope: "macro" };
    expect(parse(create, { ...base, trigger: { type: "scheduled", at: "2026-10-21T00:00:00Z" } }).success).toBe(true);
    expect(parse(create, { ...base, trigger: { type: "scheduled" } }).success).toBe(false);
    expect(parse(create, { ...base, trigger: { type: "scheduled", scheduled_for: "2026-10-21" } }).success).toBe(false);
    expect(
      parse(create, {
        ...base,
        trigger: { type: "condition", metric: "price", symbol: "MRCY", operator: "lt", value: 50 },
      }).success,
    ).toBe(true);
  });

  it("does not expose statuses the agent may not set", () => {
    expect(parse(tool("update_review_task"), { review_task_id: TASK_ID, status: "completed" }).success).toBe(false);
    expect(parse(tool("update_review_task"), { review_task_id: TASK_ID, status: "due" }).success).toBe(false);
    expect(parse(tool("update_planned_action"), { planned_action_id: PLAN_ID, status: "confirmed" }).success).toBe(false);
  });
});

describe("tool handlers shape the REST call", () => {
  it("omits expected_version on a first dossier write", async () => {
    const tool = POWERFUND_TOOLS.find((row) => row.name === "update_dossier")!;
    const calls = await run(tool, {
      symbol: "NEWCO",
      expected_version: null,
      change_reason: "v1",
      changes: { summary: "s" },
    });
    expect(calls[0]!.args[1]).not.toHaveProperty("expected_version");
  });

  it("sends horizon_days null explicitly, since absent and null differ", async () => {
    const tool = POWERFUND_TOOLS.find((row) => row.name === "record_decision_outcome")!;
    const calls = await run(tool, { ...SAMPLE_ARGS.record_decision_outcome, horizon_days: null });
    expect(calls[0]!.args[0]).toBe(DECISION_ID);
    expect(calls[0]!.args[1]).toHaveProperty("horizon_days", null);
  });

  it("joins list filters the way the REST query expects", async () => {
    const tool = POWERFUND_TOOLS.find((row) => row.name === "list_reviews")!;
    const calls = await run(tool, { status: ["completed"], symbols: ["CRDO", "AVGO"], scope: "company", limit: 5 });
    expect(calls[0]!.args[0]).toEqual({
      status: "completed",
      symbol: "CRDO,AVGO",
      scope: "company",
      limit: 5,
      evaluate: "preview",
    });
  });
});

describe("get_review_context", () => {
  const tool = POWERFUND_TOOLS.find((row) => row.name === "get_review_context")!;

  it("loads all three memories, including the portfolio chain symbol= cannot reach", async () => {
    const client = fakeAgentClient({
      getPlannedActions: {
        actions: [
          { id: PLAN_ID, symbol: "MRCY", action_type: "add" },
          { id: "other", symbol: "VRT", action_type: "add" },
        ],
      },
    });
    const result = await tool.handler(
      { symbol: "mrcy" } as never,
      { client, write: {} },
    );
    const queries = client.calls
      .filter((call) => call.method === "getReviewQueue")
      .map((call) => call.args[0]);
    expect(queries).toContainEqual({ status: "completed", symbol: "mrcy", limit: 5 });
    expect(queries).toContainEqual({ status: "completed", scope: "portfolio", limit: 5 });
    // The open-queue read previews fired triggers and records nothing.
    expect(queries).toContainEqual({ status: "open", symbol: "mrcy", evaluate: "preview" });
    expect(client.calls.map((call) => call.method)).toEqual(
      expect.arrayContaining(["getCompanyDossier", "getJournal", "getPlannedActions"]),
    );
    expect(result.open_planned_actions).toEqual([{ id: PLAN_ID, symbol: "MRCY", action_type: "add" }]);
  });

  it("needs a symbol or a theme", async () => {
    await expect(tool.handler({} as never, { client: fakeAgentClient(), write: {} })).rejects.toThrow(
      /symbol, a theme/,
    );
  });

  it("fails as a whole rather than return a partial chain of reasoning", async () => {
    const client = fakeAgentClient({
      getJournal: () => {
        throw new Error("journal down");
      },
    });
    await expect(tool.handler({ symbol: "SNDK" } as never, { client, write: {} })).rejects.toThrow(
      "journal down",
    );
  });
});
