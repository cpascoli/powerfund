import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  decisionHorizonReturns,
  fillKindForDecision,
  fillSession,
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

describe("fillSession", () => {
  it("applies a weekend fill on the next session", () => {
    expect(
      fillSession("2026-08-16T18:00:00.000Z", ["2026-08-14", "2026-08-17"]),
    ).toBe("2026-08-17");
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
      fillSession: "2026-08-12",
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
      fillSession: "2026-08-12",
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
});
