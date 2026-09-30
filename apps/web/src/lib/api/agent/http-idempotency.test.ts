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

  const args = (handler: ReturnType<typeof vi.fn>) => ({
    scope: "powerfund:journal:append" as const,
    methods: ["POST"],
    operationId: "createDecision",
    handler: handler as never,
  });
  const code = async (response: Response) =>
    ((await response.json()) as { error?: { code: string } }).error?.code;

  it("pins the key when the handler throws, because it may have written first", async () => {
    const handler = vi.fn().mockRejectedValueOnce(new Error("failed after insert?"));
    expect((await handleAgentRequest(request("k2"), args(handler))).status).toBe(500);
    const retry = await handleAgentRequest(request("k2"), args(handler));
    expect(retry.status).toBe(409);
    expect(await code(retry)).toBe("IDEMPOTENCY_OUTCOME_UNKNOWN");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("pins the key on a 5xx for the same reason", async () => {
    const handler = vi.fn().mockResolvedValue(new Response('{"error":{"code":"INTERNAL_ERROR"}}', { status: 500 }));
    await handleAgentRequest(request("k3"), args(handler));
    expect(await code(await handleAgentRequest(request("k3"), args(handler)))).toBe("IDEMPOTENCY_OUTCOME_UNKNOWN");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("frees the key only when the request was refused before writing", async () => {
    const handler = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":{"code":"RATE_LIMITED"}}', { status: 429 }))
      .mockResolvedValueOnce(new Response('{"created":true}', { status: 200 }));
    await handleAgentRequest(request("k4"), args(handler));
    expect((await handleAgentRequest(request("k4"), args(handler))).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("returns a successful write as a success even if recording it fails, and never re-runs it", async () => {
    const store = shared.store as ReturnType<typeof memoryIdempotencyStore>;
    store.complete = async () => {
      throw new Error("idempotency table unavailable");
    };
    const handler = vi.fn().mockResolvedValue(new Response('{"created":true,"decision":{"id":"d9"}}', { status: 200 }));
    const first = await handleAgentRequest(request("k5"), args(handler));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ created: true, decision: { id: "d9" } });
    expect((await handleAgentRequest(request("k5"), args(handler))).status).toBe(409);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
