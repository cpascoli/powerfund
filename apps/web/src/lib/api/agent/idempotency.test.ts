import { describe, expect, it } from "vitest";

import {
  MCP_KEY_WINDOW_MS,
  memoryIdempotencyStore,
  requestHash,
  RESERVATION_STALE_MS,
  reserveIdempotency,
} from "./idempotency";

const hash = requestHash("POST", "/api/v1/agent/decisions", '{"symbol":"MRCY"}');
const T0 = new Date("2026-09-29T10:59:59Z");
const after = (ms: number) => new Date(T0.getTime() + ms);
const key = (idempotencyKey: string) => ({ keyName: "chatgpt", idempotencyKey, operation: "createDecision", hash });

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
    return "no error";
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

describe("idempotency reservations", () => {
  it("reserves, completes, then replays the stored response", async () => {
    const store = memoryIdempotencyStore();
    const first = await reserveIdempotency(store, key("k1"), T0);
    expect(first.kind).toBe("reserved");
    await store.complete((first as { id: string }).id, 200, { created: true, id: "d1" });
    expect(await reserveIdempotency(store, key("k1"), after(1000))).toEqual({
      kind: "replay",
      status_code: 200,
      response: { created: true, id: "d1" },
    });
  });

  it("refuses a concurrent duplicate while the first attempt is still running", async () => {
    // The bug this closes: a retry sent after the MCP adapter's timeout found
    // nothing stored yet and ran the write a second time.
    const store = memoryIdempotencyStore();
    await reserveIdempotency(store, key("k1"), T0);
    expect(await codeOf(reserveIdempotency(store, key("k1"), after(20_000)))).toBe("IDEMPOTENCY_IN_PROGRESS");
  });

  it("lets the next attempt run after a failure released the key", async () => {
    const store = memoryIdempotencyStore();
    const first = await reserveIdempotency(store, key("k1"), T0);
    await store.release((first as { id: string }).id);
    expect((await reserveIdempotency(store, key("k1"), after(1000))).kind).toBe("reserved");
  });

  it("never re-runs a stale reservation: it may have written before the invocation died", async () => {
    // The finding: taking over after 5 minutes re-ran writes that had
    // committed before the process died. Stale now means "outcome unknown".
    const store = memoryIdempotencyStore();
    await reserveIdempotency(store, key("k1"), T0);
    expect(await codeOf(reserveIdempotency(store, key("k1"), after(RESERVATION_STALE_MS + 1)))).toBe(
      "IDEMPOTENCY_OUTCOME_UNKNOWN",
    );
    // Not even much later, for a caller's own random key.
    expect(await codeOf(reserveIdempotency(store, key("k1"), after(30 * 24 * 3600 * 1000)))).toBe(
      "IDEMPOTENCY_OUTCOME_UNKNOWN",
    );
  });

  it("pins an attempt whose outcome is unknown, even while fresh", async () => {
    const store = memoryIdempotencyStore();
    const first = await reserveIdempotency(store, key("k1"), T0);
    await store.markUnknown((first as { id: string }).id);
    expect(await codeOf(reserveIdempotency(store, key("k1"), after(1000)))).toBe("IDEMPOTENCY_OUTCOME_UNKNOWN");
  });

  it("lets an MCP key start over only once its window is over, and only once", async () => {
    const store = memoryIdempotencyStore();
    const first = await reserveIdempotency(store, key("mcp:record_decision:dead"), T0);
    await store.markUnknown((first as { id: string }).id);
    expect(await codeOf(reserveIdempotency(store, key("mcp:record_decision:dead"), after(RESERVATION_STALE_MS + 1)))).toBe(
      "IDEMPOTENCY_OUTCOME_UNKNOWN",
    );
    const late = after(MCP_KEY_WINDOW_MS + 1);
    const both = await Promise.allSettled([
      reserveIdempotency(store, key("mcp:record_decision:dead"), late),
      reserveIdempotency(store, key("mcp:record_decision:dead"), late),
    ]);
    expect(both.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("refuses the same key with a different body", async () => {
    const store = memoryIdempotencyStore();
    await reserveIdempotency(store, key("k1"), T0);
    expect(await codeOf(reserveIdempotency(store, { ...key("k1"), hash: "other" }, after(1)))).toBe(
      "IDEMPOTENCY_KEY_REUSED",
    );
  });

  it("gives MCP keys a sliding window with no clock boundary inside it", async () => {
    const store = memoryIdempotencyStore();
    const first = await reserveIdempotency(store, key("mcp:record_decision:abc"), T0);
    await store.complete((first as { id: string }).id, 200, { created: true });
    // 10:59:59 then 11:00:00 — the old hour bucket put a new key here.
    expect((await reserveIdempotency(store, key("mcp:record_decision:abc"), after(1000))).kind).toBe("replay");
    // An hour after the first attempt the same write is a new decision.
    expect((await reserveIdempotency(store, key("mcp:record_decision:abc"), after(MCP_KEY_WINDOW_MS + 1))).kind).toBe(
      "reserved",
    );
  });

  it("keeps permanent replay for other callers' random keys", async () => {
    const store = memoryIdempotencyStore();
    const first = await reserveIdempotency(store, key("5f0c…uuid"), T0);
    await store.complete((first as { id: string }).id, 200, { created: true });
    expect((await reserveIdempotency(store, key("5f0c…uuid"), after(30 * 24 * 3600 * 1000))).kind).toBe("replay");
  });
});
