import { describe, expect, it } from "vitest";

import { AgentApiError } from "@/lib/api/agent/errors";

import { parseResearchInboxFilter } from "./research";

function parse(query: string) {
  return parseResearchInboxFilter(new URLSearchParams(query));
}

describe("parseResearchInboxFilter", () => {
  it("defaults to every kind", () => {
    expect(parse("")).toEqual({ kinds: [] });
  });

  it("accepts one kind or a comma-separated list", () => {
    expect(parse("kind=needs_dossier")).toEqual({ kinds: ["needs_dossier"] });
    expect(parse("kind=review_due_date,diligence")).toEqual({
      kinds: ["review_due_date", "diligence"],
    });
  });

  it("rejects a kind that is not one", () => {
    expect(() => parse("kind=thesis_review")).toThrow(AgentApiError);
  });
});
