import { beforeEach, describe, expect, it, vi } from "vitest";

import { memoryIdempotencyStore } from "./idempotency";

const shared = vi.hoisted(() => ({ store: null as unknown }));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("./idempotency", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  supabaseIdempotencyStore: () => shared.store,
}));

import { handleAgentRequest } from "./http";

const KEYS = JSON.stringify([{ name: "writer", secret: "pf_test_writer_key_1", role: "write" }]);

function request(key = "retry-key") {
  return new Request("https://example.test/api/v1/agent/decisions", {
    method: "POST",
    headers: {
      authorization: "Bearer pf_test_writer_key_1",
      "content-type": "application/json",
      "idempotency-key": key,
    },
    body: '{"symbol":"VRT"}',
  });
}

beforeEach(() => {
  process.env.POWERFUND_AGENT_API_KEYS = KEYS;
  shared.store = memoryIdempotencyStore();
});

describe("handleAgentRequest idempotency", () => {
  it("runs a slow write once when a retry arrives while it is still running", async () => {
    let finish: (value: Response) => void = () => {};
    const handler = vi.fn(
      () => new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    );
    const args = { scope: "powerfund:journal:append" as const, methods: ["POST"], operationId: "createDecision", handler };

    const first = handleAgentRequest(request(), args);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const retry = await handleAgentRequest(request(), args);
    expect(retry.status).toBe(409);
    expect(((await retry.json()) as { error: { code: string } }).error.code).toBe("IDEMPOTENCY_IN_PROGRESS");

    finish(new Response(JSON.stringify({ created: true, decision: { id: "d1" } }), { status: 200 }));
    expect((await first).status).toBe(200);
    const replay = await handleAgentRequest(request(), args);
    expect(await replay.json()).toEqual({ created: true, decision: { id: "d1" } });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("releases the key when the handler throws, so a retry can run", async () => {
    const handler = vi
      .fn()
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce(new Response('{"created":true}', { status: 200 }));
    const args = { scope: "powerfund:journal:append" as const, methods: ["POST"], operationId: "createDecision", handler };
    expect((await handleAgentRequest(request("k2"), args)).status).toBe(500);
    expect((await handleAgentRequest(request("k2"), args)).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
