import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  anchorKindForDecision,
  anchorSession,
  decisionClass,
  decisionHorizonReturns,
  fillKindForDecision,
} from "@powerfund/domain";

describe("fillKindForDecision", () => {
  it("keys enter/add off buys and reduce/exit off sells", () => {
    expect(fillKindForDecision("enter")).toBe("buy");
    expect(fillKindForDecision("add")).toBe("buy");
    expect(fillKindForDecision("reduce")).toBe("sell");
    expect(fillKindForDecision("exit")).toBe("sell");
    expect(fillKindForDecision("hold")).toBeNull();
    expect(fillKindForDecision("watch")).toBeNull();
  });
});

describe("decisionClass", () => {
  it("separates originating, continuation, risk-changing and candidate judgements", () => {
    expect(decisionClass("enter")).toBe("position_originating");
    expect(decisionClass("add")).toBe("position_originating");
    expect(decisionClass("hold")).toBe("continuation");
    expect(decisionClass("reduce")).toBe("risk_changing");
    expect(decisionClass("exit")).toBe("risk_changing");
    expect(decisionClass("watch")).toBe("candidate");
  });
});

describe("anchorKindForDecision", () => {
  it("starts the clock at the fill only where a fill exists", () => {
    expect(anchorKindForDecision("enter")).toBe("fill");
    expect(anchorKindForDecision("add")).toBe("fill");
    expect(anchorKindForDecision("reduce")).toBe("fill");
    expect(anchorKindForDecision("exit")).toBe("fill");
    // The two that had no computable return before: no transaction to anchor to.
    expect(anchorKindForDecision("hold")).toBe("decision");
    expect(anchorKindForDecision("watch")).toBe("decision");
  });
});

describe("anchorSession", () => {
  const days = ["2026-08-14", "2026-08-17", "2026-08-18", "2026-08-19"];

  it("keeps a late-evening booking on its own session rather than tomorrow's", () => {
    // 23:00 ET on the 18th is already the 19th in UTC. The NAV series books the
    // flow on the 18th, so measuring the return from the 19th would grade the
    // decision from a session the book says the money was not yet in.
    expect(anchorSession("2026-08-19T03:00:00.000Z", days)).toBe("2026-08-18");
  });

  it("marks a weekend booking at the previous close, as the flow series does", () => {
    // Changed deliberately: this used to roll forward to Monday. occurred_at is a
    // booking time, not an exchange timestamp, and fillSessionDate -- which the
    // snapshots and flows already use -- attributes it to the last completed
    // session. Rolling forward here made the two disagree by a weekend.
    expect(anchorSession("2026-08-16T18:00:00.000Z", days)).toBe("2026-08-14");
  });

  it("rolls forward when the session it lands on has no bar at all", () => {
    expect(anchorSession("2026-08-17T14:00:00.000Z", ["2026-08-19"])).toBe(
      "2026-08-19",
    );
  });

  it("returns null when no session has happened yet", () => {
    expect(anchorSession("2026-08-19T14:00:00.000Z", ["2026-08-14"])).toBeNull();
  });
});

describe("decisionHorizonReturns", () => {
  const ticker = [
    { date: "2026-08-12", close: 100 },
    { date: "2026-08-13", close: 110 },
    { date: "2026-09-11", close: 120 },
    { date: "2026-11-10", close: 130 },
    { date: "2027-02-08", close: 140 },
  ];
  const spy = [
    { date: "2026-08-12", close: 200 },
    { date: "2026-08-13", close: 210 },
    { date: "2026-09-11", close: 220 },
    { date: "2026-11-10", close: 230 },
    { date: "2027-02-08", close: 240 },
  ];

  it("reports so-far returns before 30 days have elapsed", () => {
    const rows = decisionHorizonReturns({
      anchorSession: "2026-08-12",
      asOf: "2026-08-13",
      tickerBars: ticker,
      spyBars: spy,
    });
    expect(addCalendarDays("2026-08-12", 30)).toBe("2026-09-11");
    expect(rows[0]?.complete).toBe(false);
    expect(rows[0]?.tickerReturn).toBeCloseTo(0.1, 8);
    expect(rows[0]?.spyReturn).toBeCloseTo(0.05, 8);
    expect(rows[0]?.vsSpy).toBeCloseTo(0.05, 8);
  });

  it("marks a horizon complete once the target date is reached", () => {
    const rows = decisionHorizonReturns({
      anchorSession: "2026-08-12",
      asOf: "2026-09-11",
      tickerBars: ticker,
      spyBars: spy,
    });
    expect(rows[0]?.complete).toBe(true);
    expect(rows[0]?.target).toBe("2026-09-11");
    expect(rows[0]?.tickerReturn).toBeCloseTo(0.2, 8);
    expect(rows[0]?.vsSpy).toBeCloseTo(0.1, 8);
    expect(rows[1]?.complete).toBe(false);
  });

  it("returns null ticker return when the name has no bars at the anchor session", () => {
    const rows = decisionHorizonReturns({
      anchorSession: "2026-08-12",
      asOf: "2026-08-13",
      tickerBars: [{ date: "2026-08-13", close: 110 }],
      spyBars: spy,
    });
    expect(rows[0]?.tickerReturn).toBeNull();
    expect(rows[0]?.spyReturn).toBeCloseTo(0.05, 8);
    expect(rows[0]?.vsSpy).toBeNull();
  });
});
