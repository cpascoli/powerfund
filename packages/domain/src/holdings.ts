import { toCents } from "./money";
import {
  FACTOR_KEYS,
  factorExposures,
  type FactorKey,
} from "./risk";
import { utcDay } from "./performance";
import type { TransactionKind } from "./types";

export type HoldingLedgerRow = {
  occurredAt: string;
  kind: TransactionKind;
  instrumentId: string | null;
  quantity: number | null;
  cashDelta: number;
  realizedPnl: number | null;
};

export type HoldingInstrument = {
  id: string;
  symbol: string;
  themeSlug: string;
  themeName: string;
};

export type PriceBar = {
  instrumentId: string;
  date: string;
  close: number;
};

export type TickerContribution = {
  symbol: string;
  themeSlug: string;
  themeName: string;
  pnlUsd: number;
  realizedUsd: number;
  incomeUsd: number;
  startMarketValueUsd: number;
  endMarketValueUsd: number;
  avgWeightPctNav: number | null;
  avgWeightPctDeployed: number | null;
  daysHeld: number;
};

export type BucketContribution = {
  key: string;
  name: string;
  pnlUsd: number;
  avgWeightPctNav: number | null;
};

export type ContributionReport = {
  start: string;
  end: string;
  tradingDays: number;
  method: "mark_to_market_dollar";
  tickers: TickerContribution[];
  themes: BucketContribution[];
  factors: BucketContribution[];
  notes: string[];
};

export type ContributionInput = {
  from: string;
  to: string;
  tradingDays: string[];
  ledger: HoldingLedgerRow[];
  instruments: HoldingInstrument[];
  bars: PriceBar[];
};

function signedQuantity(kind: TransactionKind, quantity: number | null): number {
  const qty = Number(quantity ?? 0);
  switch (kind) {
    case "buy":
      return qty;
    case "sell":
      return -qty;
    case "deposit":
    case "withdrawal":
    case "dividend":
    case "interest":
    case "fee":
    case "adjustment":
      return 0;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function isIncomeKind(kind: TransactionKind): boolean {
  switch (kind) {
    case "dividend":
    case "interest":
      return true;
    case "deposit":
    case "withdrawal":
    case "buy":
    case "sell":
    case "fee":
    case "adjustment":
      return false;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function closeOnOrBefore(
  bars: Array<{ date: string; close: number }>,
  date: string,
): number | null {
  let close: number | null = null;
  for (const bar of bars) {
    if (bar.date <= date) close = bar.close;
    else break;
  }
  return close;
}

function closeBefore(
  bars: Array<{ date: string; close: number }>,
  date: string,
): number | null {
  let close: number | null = null;
  for (const bar of bars) {
    if (bar.date < date) close = bar.close;
    else break;
  }
  return close;
}

/** First session on or after the ledger day. Weekend/holiday fills wait until then. */
function sessionDate(utc: string, walkDays: string[]): string | null {
  for (const date of walkDays) {
    if (date >= utc) return date;
  }
  return null;
}

function factorLabel(key: FactorKey | "unclassified"): string {
  switch (key) {
    case "ai_capex":
      return "AI capex";
    case "ai_memory":
      return "AI memory";
    case "defence":
      return "Defence";
    case "nuclear":
      return "Nuclear";
    case "robotics":
      return "Robotics";
    case "grid":
      return "Grid";
    case "other":
      return "Other";
    case "unclassified":
      return "Unclassified";
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

function factorBucketName(key: string): string {
  if (key === "unclassified") return factorLabel("unclassified");
  for (const factor of FACTOR_KEYS) {
    if (factor === key) return factorLabel(factor);
  }
  return key;
}

type TickerAcc = {
  pnl: number;
  realized: number;
  income: number;
  startMv: number | null;
  endMv: number;
  navWeightSum: number;
  deployedWeightSum: number;
  daysHeld: number;
  markedAtCost: boolean;
};

function emptyAcc(): TickerAcc {
  return {
    pnl: 0,
    realized: 0,
    income: 0,
    startMv: null,
    endMv: 0,
    navWeightSum: 0,
    deployedWeightSum: 0,
    daysHeld: 0,
    markedAtCost: false,
  };
}

/**
 * Dollar contribution from reconstructed daily holdings.
 * Weekend/holiday fills are applied on the next trading day so Sunday buys
 * are not marked as if they were held on Friday.
 * `tradingDays` must include sessions from the first ledger date through `to`
 * so a later `from` does not treat historical fills as that day's cash.
 */
export function contributionFromLedger(
  input: ContributionInput,
): ContributionReport {
  const notes: string[] = [
    "Dollar mark-to-market plus dividends/interest. Buys and sells at the close are not a gain. Not a TWR attribution.",
  ];
  const days = [...new Set(input.tradingDays)]
    .filter((date) => date >= input.from && date <= input.to)
    .sort();
  if (days.length === 0) {
    return {
      start: input.from,
      end: input.to,
      tradingDays: 0,
      method: "mark_to_market_dollar",
      tickers: [],
      themes: [],
      factors: [],
      notes: ["No trading days in this range."],
    };
  }

  const byId = new Map(input.instruments.map((row) => [row.id, row]));
  const barsByInstrument = new Map<string, Array<{ date: string; close: number }>>();
  for (const bar of input.bars) {
    const list = barsByInstrument.get(bar.instrumentId) ?? [];
    list.push({ date: bar.date, close: bar.close });
    barsByInstrument.set(bar.instrumentId, list);
  }
  for (const list of barsByInstrument.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
  }

  const ledger = [...input.ledger].sort((a, b) =>
    a.occurredAt.localeCompare(b.occurredAt),
  );
  const walkDays = [...new Set(input.tradingDays)]
    .filter((date) => date <= input.to)
    .sort();
  if (walkDays.length === 0) {
    return {
      start: input.from,
      end: input.to,
      tradingDays: 0,
      method: "mark_to_market_dollar",
      tickers: [],
      themes: [],
      factors: [],
      notes: ["No trading days in this range."],
    };
  }

  const txsBySession = new Map<string, HoldingLedgerRow[]>();
  for (const row of ledger) {
    if (row.instrumentId == null) continue;
    const session = sessionDate(utcDay(row.occurredAt), walkDays);
    if (session == null) continue;
    const list = txsBySession.get(session) ?? [];
    list.push(row);
    txsBySession.set(session, list);
  }

  const qty = new Map<string, number>();
  const acc = new Map<string, TickerAcc>();
  let prevDay: string | null = null;
  const windowDays = new Set(days);

  for (const date of walkDays) {
    const qtyOpen = new Map(qty);
    const cashToday = new Map<string, number>();
    const realizedToday = new Map<string, number>();
    const incomeToday = new Map<string, number>();

    for (const row of txsBySession.get(date) ?? []) {
      if (row.instrumentId == null) continue;
      qty.set(
        row.instrumentId,
        (qty.get(row.instrumentId) ?? 0) +
          signedQuantity(row.kind, row.quantity),
      );
      cashToday.set(
        row.instrumentId,
        (cashToday.get(row.instrumentId) ?? 0) + Number(row.cashDelta),
      );
      if (row.kind === "sell") {
        realizedToday.set(
          row.instrumentId,
          (realizedToday.get(row.instrumentId) ?? 0) +
            Number(row.realizedPnl ?? 0),
        );
      }
      if (isIncomeKind(row.kind)) {
        incomeToday.set(
          row.instrumentId,
          (incomeToday.get(row.instrumentId) ?? 0) + Number(row.cashDelta),
        );
      }
    }

    const ids = new Set([
      ...qtyOpen.keys(),
      ...qty.keys(),
      ...cashToday.keys(),
    ]);
    const endMvById = new Map<string, number>();
    for (const id of ids) {
      const closeQty = qty.get(id) ?? 0;
      const openQty = qtyOpen.get(id) ?? 0;
      if (openQty === 0 && closeQty === 0 && !cashToday.has(id)) continue;
      const close = closeOnOrBefore(barsByInstrument.get(id) ?? [], date);
      const prevClose =
        prevDay == null
          ? closeBefore(barsByInstrument.get(id) ?? [], date)
          : closeOnOrBefore(barsByInstrument.get(id) ?? [], prevDay);
      const startMv = openQty === 0 ? 0 : openQty * (prevClose ?? close ?? 0);
      const endMv = closeQty === 0 ? 0 : closeQty * (close ?? prevClose ?? 0);
      endMvById.set(id, endMv);
      if (close == null && closeQty > 0) {
        const row = acc.get(id) ?? emptyAcc();
        row.markedAtCost = true;
        acc.set(id, row);
      }
      if (!windowDays.has(date)) continue;
      const row = acc.get(id) ?? emptyAcc();
      if (row.startMv == null) row.startMv = startMv;
      row.endMv = endMv;
      row.pnl += endMv - startMv + (cashToday.get(id) ?? 0);
      row.realized += realizedToday.get(id) ?? 0;
      row.income += incomeToday.get(id) ?? 0;
      if (openQty > 0 || closeQty > 0) row.daysHeld += 1;
      acc.set(id, row);
    }

    if (windowDays.has(date)) {
      let cash = 0;
      for (const row of ledger) {
        if (utcDay(row.occurredAt) <= date) cash += Number(row.cashDelta);
      }
      let deployed = 0;
      for (const value of endMvById.values()) deployed += value;
      const nav = cash + deployed;
      for (const [id, endMv] of endMvById) {
        const row = acc.get(id);
        if (row == null) continue;
        if (nav > 0) row.navWeightSum += (endMv / nav) * 100;
        if (deployed > 0) row.deployedWeightSum += (endMv / deployed) * 100;
      }
    }

    prevDay = date;
  }

  const n = days.length;
  const stale: string[] = [];
  const tickers: TickerContribution[] = [];
  for (const [id, row] of acc) {
    const meta = byId.get(id);
    const symbol = meta?.symbol ?? id;
    if (row.markedAtCost) stale.push(symbol);
    if (
      row.daysHeld === 0 &&
      Math.abs(row.pnl) < 0.005 &&
      Math.abs(row.realized) < 0.005 &&
      Math.abs(row.income) < 0.005
    ) {
      continue;
    }
    tickers.push({
      symbol,
      themeSlug: meta?.themeSlug ?? "other",
      themeName: meta?.themeName ?? "Other",
      pnlUsd: toCents(row.pnl),
      realizedUsd: toCents(row.realized),
      incomeUsd: toCents(row.income),
      startMarketValueUsd: toCents(row.startMv ?? 0),
      endMarketValueUsd: toCents(row.endMv),
      avgWeightPctNav: n > 0 ? toCents(row.navWeightSum / n) : null,
      avgWeightPctDeployed: n > 0 ? toCents(row.deployedWeightSum / n) : null,
      daysHeld: row.daysHeld,
    });
  }
  tickers.sort((a, b) => b.pnlUsd - a.pnlUsd || a.symbol.localeCompare(b.symbol));

  if (stale.length > 0) {
    notes.push(
      `No close on some days — marked through last available price: ${stale.sort().join(", ")}.`,
    );
  }

  const themeMap = new Map<string, { name: string; pnl: number; weight: number }>();
  for (const row of tickers) {
    const current = themeMap.get(row.themeSlug) ?? {
      name: row.themeName,
      pnl: 0,
      weight: 0,
    };
    current.pnl += row.pnlUsd;
    current.weight += row.avgWeightPctNav ?? 0;
    themeMap.set(row.themeSlug, current);
  }
  const themes: BucketContribution[] = [...themeMap.entries()]
    .map(([key, value]) => ({
      key,
      name: value.name,
      pnlUsd: toCents(value.pnl),
      avgWeightPctNav: toCents(value.weight),
    }))
    .sort((a, b) => b.pnlUsd - a.pnlUsd || a.key.localeCompare(b.key));

  const factorMap = new Map<string, { pnl: number; weight: number }>();
  const bump = (key: string, pnl: number, weight: number) => {
    const current = factorMap.get(key) ?? { pnl: 0, weight: 0 };
    current.pnl += pnl;
    current.weight += weight;
    factorMap.set(key, current);
  };
  for (const row of tickers) {
    const weights = factorExposures(row.symbol);
    const navW = row.avgWeightPctNav ?? 0;
    if (weights == null) {
      bump("unclassified", row.pnlUsd, navW);
      continue;
    }
    for (const key of FACTOR_KEYS) {
      const w = weights[key] ?? 0;
      if (w === 0) continue;
      bump(key, row.pnlUsd * w, navW * w);
    }
  }
  const factors: BucketContribution[] = [...factorMap.entries()]
    .map(([key, value]) => ({
      key,
      name: factorBucketName(key),
      pnlUsd: toCents(value.pnl),
      avgWeightPctNav: toCents(value.weight),
    }))
    .sort((a, b) => b.pnlUsd - a.pnlUsd || a.key.localeCompare(b.key));

  const unknown = tickers
    .filter((row) => factorExposures(row.symbol) == null)
    .map((row) => row.symbol);
  if (unknown.length > 0) {
    notes.push(
      `Unclassified factor map: ${unknown.join(", ")} — contribution sits in unclassified.`,
    );
  }

  return {
    start: days[0]!,
    end: days[days.length - 1]!,
    tradingDays: n,
    method: "mark_to_market_dollar",
    tickers,
    themes,
    factors,
    notes,
  };
}