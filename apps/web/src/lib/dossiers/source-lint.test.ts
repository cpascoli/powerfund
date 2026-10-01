import { lintDossierSource } from "@powerfund/domain";
import { describe, expect, it } from "vitest";

import { AgentApiError } from "@/lib/api/agent/errors";
import type { DbClient } from "@/lib/supabase/db";

import { saveDossierVersioned } from "./save";

const TENK = "https://www.sec.gov/Archives/edgar/data/1/000000000126000001/mrcy-20260627.htm";

describe("lintDossierSource", () => {
  it("accepts a linked source list", () => {
    expect(lintDossierSource(`- [Mercury FY2026 Form 10-K](${TENK})`)).toEqual([]);
  });

  it("accepts prose around properly linked entries, and internal inputs", () => {
    const source = [
      "Primary sources verified through 30 Sep 2026:",
      "",
      `- [Mercury FY2026 Form 10-K](${TENK}), filed 12 Aug 2026.`,
      `1. [Mercury Q4 FY2026 results](<${TENK}> "press release"), 5 Aug 2026.`,
      "- Market-price input: $61.20 close on 30 Sep 2026; refresh before a new capital decision.",
      "- PowerFund market data, 30 Sep 2026.",
      "",
      "Key figures: revenue $912M; backlog $1.4B. Scenario values are PowerFund estimates.",
    ].join("\n");
    expect(lintDossierSource(source)).toEqual([]);
  });

  it("allows ordinary prose that mentions a filing", () => {
    expect(
      lintDossierSource("Backlog figures are from the FY2026 Form 10-K and the Q4 call."),
    ).toEqual([]);
  });

  it("flags a list entry naming a document without a link", () => {
    const issues = lintDossierSource("Sources:\n- Mercury FY2026 Form 10-K");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ kind: "unlinked_list_entry", line: 2 });
    expect(issues[0]!.message).toContain("[Document title](https://...)");
  });

  it("flags a naked URL, in a list or in prose", () => {
    expect(lintDossierSource("- https://example.com/report")).toMatchObject([
      { kind: "bare_url", line: 1 },
    ]);
    expect(lintDossierSource("Results: <https://example.com/report>")).toMatchObject([
      { kind: "bare_url" },
    ]);
    // MU's production shape: a title followed by a naked URL.
    expect(lintDossierSource("- Micron FQ4 results: https://investors.micron.com/x")).toMatchObject([
      { kind: "bare_url" },
    ]);
  });

  it("does not treat a linked URL as bare when the line also has text", () => {
    expect(lintDossierSource(`See [the 10-K](${TENK}) and [the deck](https://example.com/d).`)).toEqual([]);
  });

  it("says when the URLs exist only in research_sources", () => {
    const issues = lintDossierSource("- Mercury FY2026 Form 10-K", {
      researchSources: [TENK],
    });
    expect(issues.map((issue) => issue.kind)).toEqual([
      "unlinked_list_entry",
      "research_sources_not_rendered",
    ]);
    expect(issues[1]!.text).toContain(TENK);
  });

  it("does not complain about research_sources already linked in source", () => {
    expect(
      lintDossierSource(`- [Mercury FY2026 Form 10-K](${TENK})`, { researchSources: [TENK] }),
    ).toEqual([]);
  });

  it("ignores fenced code", () => {
    expect(lintDossierSource("```\n- https://example.com\n```")).toEqual([]);
  });
});

const MALFORMED = "Sources:\n- Mercury FY2026 Form 10-K, filed 12 Aug 2026.\n- https://example.com/deck";

function client(liveSource: string | null) {
  const calls: Array<Record<string, unknown>> = [];
  const db = {
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () =>
              table === "instruments"
                ? { data: { id: "inst-1", symbol: "MRCY" }, error: null }
                : {
                    data: {
                      id: "d-1",
                      status: "investigate",
                      summary: "Old",
                      thesis: "T",
                      catalysts: null,
                      risks: null,
                      invalidation: null,
                      competitive_notes: null,
                      next_diligence: null,
                      source: liveSource,
                      research_level: "screened",
                      as_of_at: null,
                      verified_at: null,
                      next_review_at: null,
                    },
                    error: null,
                  },
          }),
        }),
      };
    },
    async rpc(_name: string, params: Record<string, unknown>) {
      calls.push(params);
      return {
        data: { changed: true, dossier_id: "d-1", version_id: "v-2", version_number: 2 },
        error: null,
      };
    },
  } as unknown as DbClient;
  return { db, calls };
}

async function save(liveSource: string | null, changes: Record<string, unknown>) {
  const { db, calls } = client(liveSource);
  await saveDossierVersioned(db, { symbol: "MRCY", change_reason: "test", changes });
  return calls;
}

async function rejection(liveSource: string | null, changes: Record<string, unknown>) {
  const { db, calls } = client(liveSource);
  const error = await saveDossierVersioned(db, {
    symbol: "MRCY",
    change_reason: "test",
    changes,
  }).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AgentApiError);
  // Rejected before anything is written.
  expect(calls).toHaveLength(0);
  return error as AgentApiError;
}

describe("saveDossierVersioned source format", () => {
  it("keeps a legacy malformed source editable when another field changes", async () => {
    const calls = await save(MALFORMED, { thesis: "New thesis" });
    expect(calls).toHaveLength(1);
    expect((calls[0]!.p_fields as { source: string }).source).toBe(MALFORMED);
  });

  it("allows the identical malformed source to be resubmitted, as the operator form does", async () => {
    expect(await save(MALFORMED, { thesis: "New", source: MALFORMED })).toHaveLength(1);
    // A textarea submits CRLF; that is not a change either.
    expect(await save(MALFORMED, { source: MALFORMED.replace(/\n/g, "\r\n") })).toHaveLength(1);
  });

  it("rejects changing a malformed source to another malformed one", async () => {
    const error = await rejection(MALFORMED, {
      source: `${MALFORMED}\n- Mercury Q1 FY2027 Form 10-Q`,
    });
    expect(error.status).toBe(422);
    expect(error.message).toContain("Source links must use descriptive Markdown syntax: [Document title](https://...)");
    const issues = (error.details as { issues: Array<{ kind: string; line: number }> }).issues;
    expect(issues.map((issue) => issue.kind)).toEqual([
      "unlinked_list_entry",
      "bare_url",
      "unlinked_list_entry",
    ]);
  });

  it("allows replacing a malformed source with linked entries", async () => {
    const fixed = `Sources:\n- [Mercury FY2026 Form 10-K](${TENK}), filed 12 Aug 2026.\n- [Mercury investor deck](https://example.com/deck)`;
    const calls = await save(MALFORMED, { source: fixed });
    expect((calls[0]!.p_fields as { source: string }).source).toBe(fixed);
  });

  it("allows a linked source on a dossier that had none", async () => {
    expect(await save(null, { source: `- [Mercury FY2026 Form 10-K](${TENK})` })).toHaveLength(1);
  });

  it("rejects a naked URL in a new source", async () => {
    const error = await rejection(null, { source: "- https://example.com/report" });
    expect(error.details).toMatchObject({ field: "changes.source" });
  });

  it("allows clearing the source", async () => {
    expect(await save(MALFORMED, { source: null })).toHaveLength(1);
  });
});
