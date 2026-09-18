import { fillSessionDate } from "./dates";
import { excessReturn, indexReturn } from "./performance";
import type { DecisionType, TransactionKind } from "./types";

export const DECISION_HORIZONS_DAYS = [30, 90, 180] as const;

/**
 * What kind of judgement a decision was, which is what makes its grade
 * comparable to another's.
 *
 * Ritual 12 has to be able to say "12 of 18 continuation decisions had correct
 * theses" without folding them in with entry timing. Seven consecutive weekly
 * holds on VRT are seven decisions and one position: grading them all is right,
 * because grading only the ones that went badly would put selection bias inside
 * the instrument built to detect it, but counting them as seven independent
 * pieces of evidence about stock-picking skill would be wrong.
 */
export type DecisionClass =
  | "position_originating"
  | "continuation"
  | "risk_changing"
  | "candidate";

export function decisionClass(type: DecisionType): DecisionClass {
  switch (type) {
    case "enter":
    case "add":
      return "position_originating";
    case "hold":
      return "continuation";
    case "reduce":
    case "exit":
      return "risk_changing";
    case "watch":
      return "candidate";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

/**
 * Which event starts the horizon clock.
 *
 * The clock belongs to the economic decision, not to a transaction. An enter is
 * underwritten at the price actually paid, so its clock starts at the fill. A
 * hold buys nothing and so has no fill at all -- it is the decision to keep
 * owning the exposure from here rather than reduce or reallocate, and the
 * counterfactual it should be measured against begins the moment that judgement
 * was made. Anchoring a hold to the original entry fill would grade every weekly
 * hold on the entry's luck instead of on the judgement being reviewed.
 *
 * `watch` gets the same treatment, which is why it is anchored rather than
 * excluded: "we looked at this and chose not to deploy" is answerable as
 * opportunity cost from the date we said it. What "correct" means for a watch is
 * not settled, so nothing grades it yet -- but the return machinery must not be
 * what makes that impossible later.
 */
export type DecisionAnchorKind = "fill" | "decision";

export function anchorKindForDecision(type: DecisionType): DecisionAnchorKind {
  return fillKindForDecision(type) == null ? "decision" : "fill";
}

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

/**
 * The trading session that starts the clock for an instant.
 *
 * Buckets on the New York calendar day via `fillSessionDate`, not the UTC day.
 * The UTC reading put anything booked after 20:00 ET onto the *next* session,
 * while `reconstructSnapshots` and the flow series put it on the booking day, so
 * the return was measured from a session the NAV series said the money was not
 * yet in. Every live fill so far was booked before 19:30 ET, so the two agreed
 * by luck rather than by construction. One rule for what session an instant
 * belongs to, as the snapshot invariant already requires of flows and marks.
 *
 * The forward roll remains, and now only covers a day with no session at all --
 * a weekend instant that `fillSessionDate` returns unchanged, or a market
 * holiday, where the first session on or after the day is the first close that
 * can mark it.
 */
export function anchorSession(at: string, tradingDays: string[]): string | null {
  const day = at.length <= 10 ? at : fillSessionDate(at);
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
  anchorSession: string;
  asOf: string;
  tickerBars: DecisionPriceBar[];
  spyBars: DecisionPriceBar[];
}): DecisionHorizonReturn[] {
  const ticker = [...input.tickerBars].sort((a, b) => a.date.localeCompare(b.date));
  const spy = [...input.spyBars].sort((a, b) => a.date.localeCompare(b.date));
  const startTicker = closeOnOrBefore(ticker, input.anchorSession);
  const startSpy = closeOnOrBefore(spy, input.anchorSession);
  const asOf = input.asOf < input.anchorSession ? input.anchorSession : input.asOf;

  return DECISION_HORIZONS_DAYS.map((days) => {
    const target = addCalendarDays(input.anchorSession, days);
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
      start: input.anchorSession,
      target,
      asOf: endTicker?.date ?? endDate,
      complete,
      tickerReturn,
      spyReturn,
      vsSpy: excessReturn(tickerReturn, spyReturn),
    };
  });
}

/**
 * Which horizons have elapsed and not yet been graded.
 *
 * Deterministic: a horizon is owed when it has elapsed and no outcome names it.
 * The horizon is read off the grade rather than inferred from when the grade was
 * written, because a grade written at day 100 is a judgement about day 100 and
 * says nothing about what the decision looked like at day 30 -- which is the
 * whole reason for grading on a clock instead of on inspiration.
 *
 * An off-clock outcome (no horizon) leaves every horizon owed, which is right:
 * it is an observation, not a clocked grade.
 */
export function dueHorizonDays(input: {
  horizons: DecisionHorizonReturn[];
  gradedHorizons: readonly (number | null)[];
}): DecisionHorizonDays[] {
  const graded = new Set(
    input.gradedHorizons.filter((days): days is number => days != null),
  );
  return input.horizons
    .filter((horizon) => horizon.complete && !graded.has(horizon.days))
    .map((horizon) => horizon.days);
}

export function isDecisionHorizonDays(
  value: number,
): value is DecisionHorizonDays {
  return (DECISION_HORIZONS_DAYS as readonly number[]).includes(value);
}
