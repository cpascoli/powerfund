import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({}) }),
}));

import { handleAgentRequest } from "./http";

const KEYS = JSON.stringify([
  { name: "reader", secret: "pf_test_reader_key_1", role: "read" },
  { name: "writer", secret: "pf_test_writer_key_1", role: "write" },
]);

describe("handleAgentRequest", () => {
  it("rejects anonymous requests", async () => {
    const previous = process.env.POWERFUND_AGENT_API_KEYS;
    process.env.POWERFUND_AGENT_API_KEYS = KEYS;
    const response = await handleAgentRequest(
      new Request("https://example.test/api/v1/agent/state"),
      {
        scope: "powerfund:state:read",
        methods: ["GET"],
        operationId: "getFundState",
        handler: async () => new Response("ok"),
      },
    );
    process.env.POWERFUND_AGENT_API_KEYS = previous;
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects read-only keys on write operations", async () => {
    const previous = process.env.POWERFUND_AGENT_API_KEYS;
    process.env.POWERFUND_AGENT_API_KEYS = KEYS;
    const response = await handleAgentRequest(
      new Request("https://example.test/api/v1/agent/companies/MRCY/dossier", {
        method: "PATCH",
        headers: {
          authorization: "Bearer pf_test_reader_key_1",
          "content-type": "application/json",
        },
        body: JSON.stringify({ change_reason: "x", changes: {} }),
      }),
      {
        scope: "powerfund:dossier:write",
        methods: ["PATCH"],
        operationId: "updateDossier",
        handler: async () => new Response("should not run"),
      },
    );
    process.env.POWERFUND_AGENT_API_KEYS = previous;
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("PERMISSION_DENIED");
  });
});
