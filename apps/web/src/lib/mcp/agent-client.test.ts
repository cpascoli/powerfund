import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFundState: vi.fn(),
  getAgentCompany: vi.fn(),
  createDecision: vi.fn(),
  loadIdempotency: vi.fn(),
  storeIdempotency: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({}) }),
}));
vi.mock("@/lib/agent/state", () => ({ getFundState: mocks.getFundState }));
vi.mock("@/lib/agent/companies", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getAgentCompany: mocks.getAgentCompany,
}));
vi.mock("@/lib/journal/create-decision", () => ({ createDecision: mocks.createDecision }));
vi.mock("@/lib/api/agent/idempotency", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadIdempotency: mocks.loadIdempotency,
  storeIdempotency: mocks.storeIdempotency,
}));

import { GET as stateGet } from "@/app/api/v1/agent/state/route";
import { READ_SCOPES, WRITE_SCOPES } from "@/lib/api/agent/scopes";
import { notFound } from "@/lib/api/agent/errors";

import { AgentApiCallError, canonicalJson, InProcessAgentClient, mcpIdempotencyKey } from "./agent-client";

const reader = new InProcessAgentClient(
  { name: "chatgpt-mcp", scopes: [...READ_SCOPES] },
  { origin: "https://powerfund.example", clientAddress: "203.0.113.9" },
);
const writer = new InProcessAgentClient(
  { name: "chatgpt-mcp", scopes: [...WRITE_SCOPES] },
  { origin: "https://powerfund.example", clientAddress: "203.0.113.9" },
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadIdempotency.mockResolvedValue(null);
  mocks.storeIdempotency.mockResolvedValue(undefined);
});

describe("InProcessAgentClient runs the real agent routes", () => {
  it("serves a read as the injected principal, without any agent key", async () => {
    const previous = process.env.POWERFUND_AGENT_API_KEYS;
    delete process.env.POWERFUND_AGENT_API_KEYS;
    mocks.getFundState.mockResolvedValue({ as_of: "2026-09-28T00:00:00Z", holdings: [] });
    try {
      const body = await reader.getFundState({ include_watchlist: false });
      expect(body).toEqual({ as_of: "2026-09-28T00:00:00Z", holdings: [] });
      expect(mocks.getFundState).toHaveBeenCalledWith(expect.anything(), {
        recent_decisions: undefined,
        include_watchlist: false,
      });
    } finally {
      process.env.POWERFUND_AGENT_API_KEYS = previous;
    }
  });

  it("leaves the REST API itself unchanged: HTTP without a key is still 401", async () => {
    const response = await stateGet(new Request("https://powerfund.example/api/v1/agent/state"));
    expect(response.status).toBe(401);
    expect(mocks.getFundState).not.toHaveBeenCalled();
  });

  it("lets the REST scope check refuse a write the principal was not granted", async () => {
    const error = await reader
      .createDecision({ symbol: "VRT", decision_type: "hold", thesis: "Intact." })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AgentApiCallError);
    expect(error).toMatchObject({ status: 403, code: "PERMISSION_DENIED" });
    expect(mocks.createDecision).not.toHaveBeenCalled();
  });

  it("runs the route's own validation and surfaces its error code", async () => {
    const error = await writer
      .createDecision({ symbol: "VRT", decision_type: "trim", thesis: "x" })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ status: 422, code: "VALIDATION_ERROR" });
    expect((error as AgentApiCallError).details.allowed).toContain("hold");
  });

  it("stamps the principal as the actor and forwards the idempotency key", async () => {
    mocks.createDecision.mockResolvedValue({ id: "d1" });
    const body = await writer.createDecision(
      { symbol: "VRT", decision_type: "hold", thesis: "Intact." },
      { idempotencyKey: "mcp:record_decision:2026-09-28T10:abc" },
    );
    expect(body).toEqual({ created: true, decision: { id: "d1" } });
    expect(mocks.createDecision.mock.calls[0]![1]).toMatchObject({ actor_name: "chatgpt-mcp" });
    expect(mocks.loadIdempotency).toHaveBeenCalledWith(
      expect.anything(),
      "chatgpt-mcp",
      "mcp:record_decision:2026-09-28T10:abc",
      expect.any(String),
    );
    expect(mocks.storeIdempotency).toHaveBeenCalledTimes(1);
  });

  it("replays a stored result instead of writing twice", async () => {
    mocks.loadIdempotency.mockResolvedValue({ status_code: 200, response: { created: true, decision: { id: "d1" } } });
    const body = await writer.createDecision(
      { symbol: "VRT", decision_type: "hold", thesis: "Intact." },
      { idempotencyKey: "k" },
    );
    expect(body).toEqual({ created: true, decision: { id: "d1" } });
    expect(mocks.createDecision).not.toHaveBeenCalled();
  });

  it("passes path parameters through to the route", async () => {
    mocks.getAgentCompany.mockResolvedValue({ symbol: "SNDK" });
    await reader.getCompanyDossier("SNDK");
    expect(mocks.getAgentCompany).toHaveBeenCalledWith(expect.anything(), "SNDK");
  });

  it("turns a route's 404 into a typed error", async () => {
    mocks.getAgentCompany.mockRejectedValue(notFound("UNKNOWN_SYMBOL", "Unknown symbol ZZZZ."));
    await expect(reader.getCompanyDossier("ZZZZ")).rejects.toMatchObject({
      status: 404,
      code: "UNKNOWN_SYMBOL",
      operationId: "getCompanyDossier",
    });
  });
});

describe("MCP idempotency keys", () => {
  it("ignores key order and undefined fields", () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: undefined }] })).toBe('{"a":[2,{"d":3}],"b":1}');
  });

  it("changes with the hour, so a deliberate repeat tomorrow is a new write", () => {
    const args = { symbol: "VRT" };
    const at10 = mcpIdempotencyKey("record_decision", args, new Date("2026-09-28T10:59:00Z"));
    const at10b = mcpIdempotencyKey("record_decision", args, new Date("2026-09-28T10:01:00Z"));
    const at11 = mcpIdempotencyKey("record_decision", args, new Date("2026-09-28T11:00:00Z"));
    expect(at10).toBe(at10b);
    expect(at10).not.toBe(at11);
  });
});
