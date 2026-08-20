import { describe, expect, it } from "vitest";

import {
  authenticateAgent,
  parseAgentKeys,
  requireScope,
} from "./auth";
import { AgentApiError } from "./errors";

const KEYS = JSON.stringify([
  {
    name: "reader",
    secret: "pf_test_reader_key_1",
    role: "read",
  },
  {
    name: "writer",
    secret: "pf_test_writer_key_1",
    role: "write",
  },
]);

function requestWith(token?: string) {
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  return new Request("https://example.test/api/v1/agent/state", { headers });
}

describe("agent auth", () => {
  it("parses read and write roles into scopes", () => {
    const keys = parseAgentKeys(KEYS);
    expect(keys[0]?.scopes).not.toContain("powerfund:dossier:write");
    expect(keys[1]?.scopes).toContain("powerfund:dossier:write");
    expect(keys[0]?.scopes).toContain("powerfund:reviews:read");
    expect(keys[0]?.scopes).not.toContain("powerfund:reviews:write");
    expect(keys[1]?.scopes).toContain("powerfund:reviews:write");
  });

  it("rejects missing bearer tokens", () => {
    expect(() => authenticateAgent(requestWith(), KEYS)).toThrow(AgentApiError);
    try {
      authenticateAgent(requestWith(), KEYS);
    } catch (error) {
      expect(error).toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    }
  });

  it("rejects unknown tokens", () => {
    try {
      authenticateAgent(requestWith("nope-nope-nope-nope"), KEYS);
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    }
  });

  it("accepts a configured token", () => {
    const principal = authenticateAgent(requestWith("pf_test_writer_key_1"), KEYS);
    expect(principal.name).toBe("writer");
  });

  it("blocks read-only keys from write scopes", () => {
    const principal = authenticateAgent(requestWith("pf_test_reader_key_1"), KEYS);
    expect(() => requireScope(principal, "powerfund:dossier:write")).toThrow(
      AgentApiError,
    );
    try {
      requireScope(principal, "powerfund:dossier:write");
    } catch (error) {
      expect(error).toMatchObject({ status: 403, code: "PERMISSION_DENIED" });
    }
  });
});
