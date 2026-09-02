import {
  BENCHMARKS,
  INCEPTION_DATE,
  PERFORMANCE_REVIEWS,
  accumulateLedgerFlows,
  buildPerformancePoints,
  excessReturn,
  indexReturn,
  slicePointsInRange,
  slicePointsOnOrAfter,
  utcDay,
  windowReturn,
  type PerformanceMark,
  type PerformancePoint,
} from "@powerfund/domain";
import type { Database } from "@powerfund/db";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

type Db = SupabaseClient<Database>;
type TransactionKind = Database["public"]["Enums"]["transaction_kind"];

export type LivePerformanceMark = {
  asOf: string;
  nav: number;
  invested: number;
  positionsValue: number;
};

export type PerformanceWindowReport = {
  id: string;
  label: string;
  start: string;
  end: string;
  points: number;
  navReturn: number | null;
  deployedReturn: number | null;
  successReturn: number | null;
  styleReturn: number | null;
  navVsSuccess: number | null;
  navVsStyle: number | null;
  deployedVsSuccess: number | null;
  deployedVsStyle: number | null;
  navDrawdownPct: number | null;
  navMaxDrawdownPct: number | null;
  deployedDrawdownPct: number | null;
  deployedMaxDrawdownPct: number | null;
};

export type PerformanceDrawdownReport = {
  navCurrentPct: number | null;
  navMaxPct: number | null;
  deployedCurrentPct: number | null;
  deployedMaxPct: number | null;
};

export type PerformanceReport = {
  asOf: string;
  windows: PerformanceWindowReport[];
  drawdown: PerformanceDrawdownReport;
  notes: string[];
};

export type PerformanceRange = {
  from?: string;
  to?: string;
};

type SnapshotDbRow = {
  as_of: string;
  snapshot_date: string | null;
  nav: number;
  invested: number;
  positions_value: number;
};

type FlowDbRow = {
  occurred_at: string;
  kind: TransactionKind;
  cash_delta: number;
};

type BenchmarkDbRow = {
  role: "success" | "style";
  label: string;
  instrument_id: string;
};

type BarDbRow = {
  instrument_id: string;
  bar_date: string;
  close: number | null;
  adj_close: number | null;
};

function levelOnOrBefore(
  bars: Array<{ date: string; close: number }>,
  date: string,
): number | null {
  let level: number | null = null;
  for (const bar of bars) {
    if (bar.date <= date) level = bar.close;
    else break;
  }
  return level;
}

function flowsByDay(rows: FlowDbRow[]) {
  return accumulateLedgerFlows(
    rows.map((row) => ({
      occurredAt: row.occurred_at,
      kind: row.kind,
      cashDelta: Number(row.cash_delta),
    })),
  );
}


export async function buildPerformanceReport(
  db: Db,
  live: LivePerformanceMark,
  range?: PerformanceRange,
): Promise<PerformanceReport> {
  const notes: string[] = [
    "S&P 500 (SPY) is the success benchmark; QQQ is the style benchmark. No blend.",
    "NAV includes cash and grades the cash decision. Deployed is stock picking only.",
  ];

  const [
    { data: snapshotData, error: snapshotError },
    { data: flowData, error: flowError },
    { data: benchmarkData, error: benchmarkError },
  ] = await Promise.all([
    db
      .from("portfolio_snapshots")
      .select("as_of, snapshot_date, nav, invested, positions_value")
      .order("as_of", { ascending: true }),
    db.from("transactions").select("occurred_at, kind, cash_delta"),
    db.from("benchmarks").select("role, label, instrument_id"),
  ]);

  if (snapshotError) {
    throw new Error(`Failed to load snapshots: ${snapshotError.message}`);
  }
  if (flowError) {
    throw new Error(`Failed to load ledger flows: ${flowError.message}`);
  }
  if (benchmarkError) {
    throw new Error(`Failed to load benchmarks: ${benchmarkError.message}`);
  }

  const flows = flowsByDay((flowData as FlowDbRow[] | null) ?? []);
  const snapshots = (snapshotData as SnapshotDbRow[] | null) ?? [];
  const marks: PerformanceMark[] = snapshots.map((row) => ({
    date: row.snapshot_date ?? utcDay(row.as_of),
    nav: Number(row.nav),
    invested: Number(row.invested),
    positionsValue: Number(row.positions_value),
  }));

  const liveDate = utcDay(live.asOf);
  const includeLive = range?.to == null || liveDate <= range.to;
  if (includeLive) {
    const last = marks.at(-1);
    const liveMark: PerformanceMark = {
      date: liveDate,
      nav: live.nav,
      invested: live.invested,
      positionsValue: live.positionsValue,
    };
    if (last == null || last.date < liveDate) {
      marks.push(liveMark);
    } else {
      marks[marks.length - 1] = { ...liveMark, date: last.date };
    }
  }

  // Flows attach by interval, so a fill booked after the last snapshot lands on
  // the live mark instead of on a mark that predates it.
  const points: PerformancePoint[] = buildPerformancePoints(marks, flows, {
    openEndedFinalMark: includeLive,
  });

  const benchmarks = (benchmarkData as BenchmarkDbRow[] | null) ?? [];
  const instrumentIds = benchmarks.map((row) => row.instrument_id);
  const barsByInstrument = new Map<
    string,
    Array<{ date: string; close: number }>
  >();

  if (instrumentIds.length > 0) {
    const { data: barData, error: barError } = await db
      .from("market_bars")
      .select("instrument_id, bar_date, close, adj_close")
      .in("instrument_id", instrumentIds)
      .gte("bar_date", INCEPTION_DATE)
      .order("bar_date", { ascending: true });
    if (barError) {
      throw new Error(`Failed to load benchmark bars: ${barError.message}`);
    }
    for (const row of (barData as BarDbRow[] | null) ?? []) {
      const close = row.adj_close ?? row.close;
      if (close == null) continue;
      const list = barsByInstrument.get(row.instrument_id) ?? [];
      list.push({ date: row.bar_date, close: Number(close) });
      barsByInstrument.set(row.instrument_id, list);
    }
  }

  const success = benchmarks.find((row) => row.role === "success");
  const style = benchmarks.find((row) => row.role === "style");
  if (success == null || (barsByInstrument.get(success.instrument_id) ?? []).length === 0) {
    notes.push("SPY bars are not ingested yet — success benchmark is blank until the next bars job.");
  }
  if (style == null || (barsByInstrument.get(style.instrument_id) ?? []).length === 0) {
    notes.push("QQQ bars are not ingested yet — style benchmark is blank until the next bars job.");
  }
  if (points.length < 2) {
    notes.push("Need two NAV marks to score a window. The nightly snapshot job fills the series.");
  }

  const customRange = range?.from != null || range?.to != null;
  const windowSpecs = customRange
    ? [
        {
          id: "custom",
          label:
            range?.from && range.to
              ? `${range.from} → ${range.to}`
              : range?.from
                ? `Since ${range.from}`
                : `Through ${range.to}`,
          startDate: range?.from ?? INCEPTION_DATE,
        },
      ]
    : [
        { id: "inception", label: "Since inception", startDate: INCEPTION_DATE },
        ...PERFORMANCE_REVIEWS.map((review) => ({
          id: review.id,
          label: `Since ${review.label}`,
          startDate: review.date,
        })),
      ];

  const windows: PerformanceWindowReport[] = [];
  for (const spec of windowSpecs) {
    const sliced = customRange
      ? slicePointsInRange(points, range?.from, range?.to)
      : slicePointsOnOrAfter(points, spec.startDate);
    const computed = windowReturn(sliced);
    if (computed == null) continue;

    const successLevel = success
      ? {
          start: levelOnOrBefore(
            barsByInstrument.get(success.instrument_id) ?? [],
            computed.start,
          ),
          end: levelOnOrBefore(
            barsByInstrument.get(success.instrument_id) ?? [],
            computed.end,
          ),
        }
      : { start: null, end: null };
    const styleLevel = style
      ? {
          start: levelOnOrBefore(
            barsByInstrument.get(style.instrument_id) ?? [],
            computed.start,
          ),
          end: levelOnOrBefore(
            barsByInstrument.get(style.instrument_id) ?? [],
            computed.end,
          ),
        }
      : { start: null, end: null };

    const successRet = indexReturn(successLevel.start, successLevel.end);
    const styleRet = indexReturn(styleLevel.start, styleLevel.end);

    windows.push({
      id: spec.id,
      label: spec.label,
      start: computed.start,
      end: computed.end,
      points: computed.points,
      navReturn: computed.navReturn,
      deployedReturn: computed.deployedReturn,
      successReturn: successRet,
      styleReturn: styleRet,
      navVsSuccess: excessReturn(computed.navReturn, successRet),
      navVsStyle: excessReturn(computed.navReturn, styleRet),
      deployedVsSuccess: excessReturn(computed.deployedReturn, successRet),
      deployedVsStyle: excessReturn(computed.deployedReturn, styleRet),
      navDrawdownPct: computed.navDrawdownPct,
      navMaxDrawdownPct: computed.navMaxDrawdownPct,
      deployedDrawdownPct: computed.deployedDrawdownPct,
      deployedMaxDrawdownPct: computed.deployedMaxDrawdownPct,
    });
  }

  const drawdownSlice = customRange
    ? slicePointsInRange(points, range?.from, range?.to)
    : points;
  const scored = windowReturn(drawdownSlice);

  return {
    asOf: live.asOf,
    windows,
    drawdown: {
      navCurrentPct: scored?.navDrawdownPct ?? null,
      navMaxPct: scored?.navMaxDrawdownPct ?? null,
      deployedCurrentPct: scored?.deployedDrawdownPct ?? null,
      deployedMaxPct: scored?.deployedMaxDrawdownPct ?? null,
    },
    notes,
  };
}

export async function loadLivePerformanceMark(
  db: Db,
): Promise<LivePerformanceMark> {
  const [
    { data: stateData, error: stateError },
    { data: positionData, error: positionError },
  ] = await Promise.all([
    db.from("portfolio_state").select("cash").limit(1).maybeSingle(),
    db
      .from("positions")
      .select("instrument_id, quantity, avg_cost")
      .eq("status", "open"),
  ]);
  if (stateError) {
    throw new Error(`Failed to load cash: ${stateError.message}`);
  }
  if (positionError) {
    throw new Error(`Failed to load positions: ${positionError.message}`);
  }

  const cash = Number((stateData as { cash: number } | null)?.cash ?? 0);
  const positions =
    (positionData as Array<{
      instrument_id: string;
      quantity: number;
      avg_cost: number;
    }> | null) ?? [];

  let invested = 0;
  let positionsValue = 0;
  for (const position of positions) {
    const quantity = Number(position.quantity);
    const avgCost = Number(position.avg_cost);
    invested += quantity * avgCost;
    const { data: bar, error: barError } = await db
      .from("market_bars")
      .select("close, adj_close")
      .eq("instrument_id", position.instrument_id)
      .order("bar_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (barError) {
      throw new Error(`Failed to load close: ${barError.message}`);
    }
    const close = Number(
      (bar as { adj_close: number | null; close: number | null } | null)
        ?.adj_close ??
        (bar as { close: number | null } | null)?.close ??
        avgCost,
    );
    positionsValue += quantity * close;
  }

  return {
    asOf: new Date().toISOString(),
    nav: cash + positionsValue,
    invested,
    positionsValue,
  };
}

export async function getPerformanceReport(
  live?: LivePerformanceMark,
  range?: PerformanceRange,
): Promise<PerformanceReport> {
  const supabase = await createClient();
  const mark = live ?? (await loadLivePerformanceMark(supabase));
  return buildPerformanceReport(supabase, mark, range);
}

export { BENCHMARKS };
