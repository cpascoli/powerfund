import { utcDay } from "./dates";
import { excessReturn, indexReturn } from "./performance";
import type { DecisionType, TransactionKind } from "./types";

export const DECISION_HORIZONS_DAYS = [30, 90, 180] as const;

export type DecisionHorizonDays = (typeof DECISION_HORIZONS_DAYS)[number];

export type DecisionPriceBar = {
  date: string;
  close: number;
};

export type DecisionHorizonReturn = {
  days: DecisionHorizonDays;
  start: string;
  target: string;
  asOf: string;
  complete: boolean;
  tickerReturn: number | null;
  spyReturn: number | null;
  vsSpy: number | null;
};

export function fillKindForDecision(
  type: DecisionType,
): Extract<TransactionKind, "buy" | "sell"> | null {
  switch (type) {
    case "enter":
    case "add":
      return "buy";
    case "reduce":
    case "exit":
      return "sell";
    case "hold":
    case "watch":
      return null;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

export function addCalendarDays(date: string, days: number): string {
  const start = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(start)) {
    throw new Error(`Invalid date: ${date}`);
  }
  return new Date(start + days * 86_400_000).toISOString().slice(0, 10);
}

/** First trading day on or after the ledger day. Weekend fills wait until then. */
export function fillSession(utc: string, tradingDays: string[]): string | null {
  const day = utc.length <= 10 ? utc : utcDay(utc);
  for (const date of tradingDays) {
    if (date >= day) return date;
  }
  return null;
}

function closeOnOrBefore(
  bars: DecisionPriceBar[],
  date: string,
): { date: string; close: number } | null {
  let found: { date: string; close: number } | null = null;
  for (const bar of bars) {
    if (bar.date <= date) found = bar;
    else break;
  }
  return found;
}

/**
 * Close-to-close total return from the fill session vs SPY.
 * Horizons that have not elapsed still report the so-far mark.
 */
export function decisionHorizonReturns(input: {
  fillSession: string;
  asOf: string;
  tickerBars: DecisionPriceBar[];
  spyBars: DecisionPriceBar[];
}): DecisionHorizonReturn[] {
  const ticker = [...input.tickerBars].sort((a, b) => a.date.localeCompare(b.date));
  const spy = [...input.spyBars].sort((a, b) => a.date.localeCompare(b.date));
  const startTicker = closeOnOrBefore(ticker, input.fillSession);
  const startSpy = closeOnOrBefore(spy, input.fillSession);
  const asOf = input.asOf < input.fillSession ? input.fillSession : input.asOf;

  return DECISION_HORIZONS_DAYS.map((days) => {
    const target = addCalendarDays(input.fillSession, days);
    const complete = asOf >= target;
    const endDate = complete ? target : asOf;
    const endTicker = closeOnOrBefore(ticker, endDate);
    const endSpy = closeOnOrBefore(spy, endDate);
    const tickerReturn =
      startTicker && endTicker && endTicker.date >= startTicker.date
        ? indexReturn(startTicker.close, endTicker.close)
        : null;
    const spyReturn =
      startSpy && endSpy && endSpy.date >= startSpy.date
        ? indexReturn(startSpy.close, endSpy.close)
        : null;
    return {
      days,
      start: input.fillSession,
      target,
      asOf: endTicker?.date ?? endDate,
      complete,
      tickerReturn,
      spyReturn,
      vsSpy: excessReturn(tickerReturn, spyReturn),
    };
  });
}
