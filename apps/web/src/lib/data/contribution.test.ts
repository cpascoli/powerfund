import { describe, expect, it } from "vitest";
import {
  contributionFromLedger,
  type HoldingInstrument,
  type HoldingLedgerRow,
  type PriceBar,
} from "@powerfund/domain";

const vrt: HoldingInstrument = {
  id: "vrt",
  symbol: "VRT",
  themeSlug: "ai-infrastructure",
  themeName: "AI Infrastructure",
};

function buy(
  at: string,
  quantity: number,
  price: number,
): HoldingLedgerRow {
  return {
    occurredAt: at,
    kind: "buy",
    instrumentId: "vrt",
    quantity,
    cashDelta: -(quantity * price),
    realizedPnl: null,
  };
}

function bars(closes: Array<[string, number]>): PriceBar[] {
  return closes.map(([date, close]) => ({
    instrumentId: "vrt",
    date,
    close,
  }));
}

describe("contributionFromLedger", () => {
  it("does not treat a same-day fill at the close as a gain", () => {
    const report = contributionFromLedger({
      from: "2026-08-12",
      to: "2026-08-12",
      tradingDays: ["2026-08-12"],
      instruments: [vrt],
      ledger: [buy("2026-08-12T14:00:00.000Z", 10, 100)],
      bars: bars([["2026-08-12", 100]]),
    });
    expect(report.tickers).toHaveLength(1);
    expect(report.tickers[0]?.pnlUsd).toBe(0);
    expect(report.tickers[0]?.endMarketValueUsd).toBe(1000);
  });

  it("attributes the next day's mark-to-market to the ticker", () => {
    const report = contributionFromLedger({
      from: "2026-08-12",
      to: "2026-08-13",
      tradingDays: ["2026-08-12", "2026-08-13"],
      instruments: [vrt],
      ledger: [buy("2026-08-12T14:00:00.000Z", 10, 100)],
      bars: bars([
        ["2026-08-12", 100],
        ["2026-08-13", 110],
      ]),
    });
    expect(report.tickers[0]?.pnlUsd).toBe(100);
    expect(report.themes[0]?.key).toBe("ai-infrastructure");
    expect(report.factors.some((row) => row.key === "ai_capex")).toBe(true);
  });

  it("does not dump historical P&L onto the first day of a later window", () => {
    const report = contributionFromLedger({
      from: "2026-08-14",
      to: "2026-08-14",
      tradingDays: ["2026-08-12", "2026-08-13", "2026-08-14"],
      instruments: [vrt],
      ledger: [buy("2026-08-12T14:00:00.000Z", 10, 100)],
      bars: bars([
        ["2026-08-12", 100],
        ["2026-08-13", 110],
        ["2026-08-14", 111],
      ]),
    });
    expect(report.tickers[0]?.pnlUsd).toBe(10);
    expect(report.tickers[0]?.startMarketValueUsd).toBe(1100);
  });

  it("applies a weekend fill on the next session without Friday mark-to-market", () => {
    const report = contributionFromLedger({
      from: "2026-08-14",
      to: "2026-08-17",
      tradingDays: ["2026-08-14", "2026-08-17"],
      instruments: [vrt],
      ledger: [buy("2026-08-16T18:00:00.000Z", 10, 100)],
      bars: bars([
        ["2026-08-14", 90],
        ["2026-08-17", 100],
      ]),
    });
    expect(report.tickers[0]?.pnlUsd).toBe(0);
    expect(report.tickers[0]?.endMarketValueUsd).toBe(1000);
  });

  it("does not treat a weekend fill as inventory held into the next session", () => {
    const report = contributionFromLedger({
      from: "2026-08-17",
      to: "2026-08-17",
      tradingDays: ["2026-08-17"],
      instruments: [vrt],
      ledger: [buy("2026-08-16T18:00:00.000Z", 10, 100)],
      bars: bars([["2026-08-17", 100]]),
    });
    expect(report.tickers[0]?.pnlUsd).toBe(0);
    expect(report.tickers[0]?.startMarketValueUsd).toBe(0);
    expect(report.tickers[0]?.endMarketValueUsd).toBe(1000);
  });

  it("counts a dividend as income and as P&L", () => {
    const report = contributionFromLedger({
      from: "2026-08-13",
      to: "2026-08-13",
      tradingDays: ["2026-08-12", "2026-08-13"],
      instruments: [vrt],
      ledger: [
        buy("2026-08-12T14:00:00.000Z", 10, 100),
        {
          occurredAt: "2026-08-13T12:00:00.000Z",
          kind: "dividend",
          instrumentId: "vrt",
          quantity: null,
          cashDelta: 5,
          realizedPnl: null,
        },
      ],
      bars: bars([
        ["2026-08-12", 100],
        ["2026-08-13", 100],
      ]),
    });
    expect(report.tickers[0]?.incomeUsd).toBe(5);
    expect(report.tickers[0]?.pnlUsd).toBe(5);
  });
});
