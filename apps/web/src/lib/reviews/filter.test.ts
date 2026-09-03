import { describe, expect, it } from "vitest";
import { OPEN_REVIEW_TASK_STATUSES } from "@powerfund/domain";
import { AgentApiError } from "@/lib/api/agent/errors";
import {
  REVIEW_QUEUE_DEFAULT_LIMIT,
  REVIEW_QUEUE_MAX_LIMIT,
  parseReviewQueueFilter,
} from "./filter";

function parse(query: string) {
  return parseReviewQueueFilter(new URLSearchParams(query));
}

describe("parseReviewQueueFilter", () => {
  it("defaults to the open queue, oldest first", () => {
    const filter = parse("");
    expect(filter.statuses).toEqual([...OPEN_REVIEW_TASK_STATUSES]);
    expect(filter.order).toBe("asc");
    expect(filter.historical).toBe(false);
    expect(filter.limit).toBe(REVIEW_QUEUE_DEFAULT_LIMIT);
  });

  it("reads history newest first", () => {
    // "The last five reviews touching CRDO" is the common ask, so completed
    // work defaults to descending.
    const filter = parse("status=completed");
    expect(filter.order).toBe("desc");
    expect(filter.historical).toBe(true);
  });

  it("does not evaluate triggers on a history query", () => {
    // Evaluating mutates pending rows; a read of finished work has no business
    // doing that.
    expect(parse("status=completed").evaluate).toBe(false);
    expect(parse("").evaluate).toBe(true);
    expect(parse("status=completed&evaluate=true").evaluate).toBe(true);
    expect(parse("evaluate=false").evaluate).toBe(false);
    expect(parse("evaluate=0").evaluate).toBe(false);
  });

  it("accepts several statuses at once", () => {
    const filter = parse("status=due,in_progress");
    expect(filter.statuses).toEqual(["due", "in_progress"]);
    expect(filter.historical).toBe(false);
  });

  it("treats all as no status filter", () => {
    expect(parse("status=all").statuses).toEqual([]);
  });

  it("rejects a status that is not one", () => {
    expect(() => parse("status=finished")).toThrow(AgentApiError);
  });

  it("normalises symbols and accepts either spelling", () => {
    expect(parse("symbol=crdo").symbols).toEqual(["CRDO"]);
    expect(parse("symbols=crdo,avgo").symbols).toEqual(["CRDO", "AVGO"]);
    expect(parse("symbol=CRDO,crdo").symbols).toEqual(["CRDO"]);
  });

  it("takes themes as slugs or names", () => {
    expect(parse("theme=ai-infrastructure").themes).toEqual([
      "ai-infrastructure",
    ]);
    expect(parse("themes=energy,defence").themes).toEqual(["energy", "defence"]);
  });

  it("validates scope against the real scopes", () => {
    expect(parse("scope=portfolio").scope).toBe("portfolio");
    expect(parse("scope=MACRO").scope).toBe("macro");
    expect(() => parse("scope=company-ish")).toThrow(AgentApiError);
  });

  it("reads a bare date as the start of that UTC day", () => {
    // So "since the monthly pass" does not require thinking about time zones.
    expect(parse("completed_since=2026-09-01").completedSince).toBe(
      "2026-09-01T00:00:00.000Z",
    );
  });

  it("accepts a full timestamp", () => {
    expect(
      parse("completed_since=2026-09-01T08:23:00Z").completedSince,
    ).toBe("2026-09-01T08:23:00.000Z");
  });

  it("rejects a date it cannot parse", () => {
    expect(() => parse("completed_since=last-tuesday")).toThrow(AgentApiError);
    expect(() => parse("completed_before=nonsense")).toThrow(AgentApiError);
  });

  it("caps the limit rather than trusting it", () => {
    expect(parse("limit=5").limit).toBe(5);
    expect(parse(`limit=${REVIEW_QUEUE_MAX_LIMIT * 10}`).limit).toBe(
      REVIEW_QUEUE_MAX_LIMIT,
    );
    expect(() => parse("limit=0")).toThrow(AgentApiError);
    expect(() => parse("limit=-3")).toThrow(AgentApiError);
    expect(() => parse("limit=many")).toThrow(AgentApiError);
  });

  it("lets order be overridden explicitly", () => {
    expect(parse("status=completed&order=asc").order).toBe("asc");
    expect(parse("order=desc").order).toBe("desc");
    expect(() => parse("order=sideways")).toThrow(AgentApiError);
  });

  it("builds the two shapes the operating process needs", () => {
    // "The last five completed reviews relevant to CRDO."
    const company = parse("status=completed&symbol=CRDO&limit=5");
    expect(company).toMatchObject({
      statuses: ["completed"],
      symbols: ["CRDO"],
      limit: 5,
      order: "desc",
      evaluate: false,
    });

    // "Every portfolio conclusion since the previous monthly book pass."
    const book = parse(
      "status=completed&scope=portfolio&completed_since=2026-09-01",
    );
    expect(book).toMatchObject({
      statuses: ["completed"],
      scope: "portfolio",
      completedSince: "2026-09-01T00:00:00.000Z",
      order: "desc",
    });
  });
});
