import { describe, expect, it } from "vitest";

import {
  REVIEW_OUTPUT_KINDS,
  denormalizedSchedule,
  evaluateReviewTriggers,
  evaluateTrigger,
  parseReviewTrigger,
  returnPctKey,
} from "@powerfund/domain";

describe("review triggers", () => {
  const asOf = new Date("2026-08-22T12:00:00.000Z");

  it("marks a scheduled task due once the time is reached", () => {
    const trigger = parseReviewTrigger({
      type: "scheduled",
      at: "2026-08-22T00:00:00Z",
    });
    expect(evaluateTrigger(trigger, asOf).satisfied).toBe(true);
    expect(
      evaluateTrigger(trigger, new Date("2026-08-21T23:59:59.000Z")).satisfied,
    ).toBe(false);
  });

  it("opens an event window at not_before and stays due after due_by", () => {
    const trigger = parseReviewTrigger({
      type: "event_window",
      not_before: "2026-08-22T00:00:00Z",
      due_by: "2026-08-29T00:00:00Z",
    });
    expect(
      evaluateTrigger(trigger, new Date("2026-08-21T23:00:00.000Z")).satisfied,
    ).toBe(false);
    expect(evaluateTrigger(trigger, asOf).satisfied).toBe(true);
    expect(
      evaluateTrigger(trigger, new Date("2026-09-01T00:00:00.000Z")).satisfied,
    ).toBe(true);
    expect(denormalizedSchedule(trigger).due_by).toBe(
      "2026-08-29T00:00:00.000Z",
    );
  });

  it("marks a price condition due when the last price satisfies the operator", () => {
    const trigger = parseReviewTrigger({
      type: "condition",
      metric: "price",
      symbol: "mrcy",
      operator: "lt",
      value: 50,
    });
    expect(
      evaluateTrigger(trigger, asOf, { lastPrice: { MRCY: 49.5 }, returnPct: {} })
        .satisfied,
    ).toBe(true);
    expect(
      evaluateTrigger(trigger, asOf, { lastPrice: { MRCY: 50 }, returnPct: {} })
        .satisfied,
    ).toBe(false);
  });

  it("marks a return condition due from lookback percent change", () => {
    const trigger = parseReviewTrigger({
      type: "condition",
      metric: "price_return_pct",
      symbol: "MRCY",
      operator: "lte",
      value: -10,
      lookback_days: 20,
    });
    const key = returnPctKey("MRCY", 20);
    expect(
      evaluateTrigger(trigger, asOf, {
        lastPrice: {},
        returnPct: { [key]: -12.5 },
      }).satisfied,
    ).toBe(true);
  });

  it("does not auto-due non-evaluable metrics", () => {
    const trigger = parseReviewTrigger({
      type: "condition",
      metric: "backlog",
      symbol: "MRCY",
      operator: "gt",
      value: 1_000_000_000,
    });
    const result = evaluateTrigger(trigger, asOf);
    expect(result.evaluable).toBe(false);
    expect(result.satisfied).toBe(false);
  });

  it("evaluates pending tasks idempotently", () => {
    const trigger = parseReviewTrigger({
      type: "scheduled",
      at: "2026-08-20T00:00:00Z",
    });
    const first = evaluateReviewTriggers(
      [{ id: "task-1", status: "pending", trigger }],
      asOf,
    );
    expect(first.markDueIds).toEqual(["task-1"]);
    const second = evaluateReviewTriggers(
      [{ id: "task-1", status: "due", trigger }],
      asOf,
    );
    expect(second.markDueIds).toEqual([]);
  });

  it("never emits ledger mutations from trigger evaluation", () => {
    const { markDueIds, evaluations } = evaluateReviewTriggers(
      [
        {
          id: "task-1",
          status: "pending",
          trigger: parseReviewTrigger({
            type: "scheduled",
            at: "2026-08-01T00:00:00Z",
          }),
        },
      ],
      asOf,
    );
    expect(markDueIds).toEqual(["task-1"]);
    expect(JSON.stringify({ markDueIds, evaluations })).not.toContain(
      "transaction",
    );
    expect(JSON.stringify({ markDueIds, evaluations })).not.toContain(
      "planned_action",
    );
  });

  it("complete links only to research and intention rows", () => {
    expect(REVIEW_OUTPUT_KINDS).toEqual([
      "dossier_version",
      "decision",
      "planned_action",
    ]);
    expect(REVIEW_OUTPUT_KINDS).not.toContain("transaction");
  });
});
