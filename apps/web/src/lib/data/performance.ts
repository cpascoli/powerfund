import {
  BENCHMARKS,
  INCEPTION_DATE,
  PERFORMANCE_REVIEWS,
  accumulateLedgerFlows,
  excessReturn,
  indexReturn,
  slicePointsOnOrAfter,
  utcDay,
  windowReturn,
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
};

export type PerformanceReport = {
  asOf: string;
  windows: PerformanceWindowReport[];
  notes: string[];
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

function toPoint(
  date: string,
  nav: number,
  invested: number,
  positionsValue: number,
  flows: Map<string, { external: number; sleeve: number }>,
): PerformancePoint {
  const flow = flows.get(date) ?? { external: 0, sleeve: 0 };
  return {
    date,
    nav,
    invested,
    positionsValue,
    externalFlow: flow.external,
    sleeveFlow: flow.sleeve,
  };
}

export async function buildPerformanceReport(
  db: Db,
  live: LivePerformanceMark,
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
  const points: PerformancePoint[] = snapshots.map((row) =>
    toPoint(
      row.snapshot_date ?? utcDay(row.as_of),
      Number(row.nav),
      Number(row.invested),
      Number(row.positions_value),
      flows,
    ),
  );

  const liveDate = utcDay(live.asOf);
  const last = points.at(-1);
  const livePoint = toPoint(
    liveDate,
    live.nav,
    live.invested,
    live.positionsValue,
    flows,
  );
  if (last == null || last.date < liveDate) {
    points.push(livePoint);
  } else if (last.date === liveDate) {
    points[points.length - 1] = livePoint;
  }

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

  const windowSpecs = [
    { id: "inception", label: "Since inception", startDate: INCEPTION_DATE },
    ...PERFORMANCE_REVIEWS.map((review) => ({
      id: review.id,
      label: `Since ${review.label}`,
      startDate: review.date,
    })),
  ];

  const windows: PerformanceWindowReport[] = [];
  for (const spec of windowSpecs) {
    const sliced = slicePointsOnOrAfter(points, spec.startDate);
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
    });
  }

  return {
    asOf: live.asOf,
    windows,
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
): Promise<PerformanceReport> {
  const supabase = await createClient();
  const mark = live ?? (await loadLivePerformanceMark(supabase));
  return buildPerformanceReport(supabase, mark);
}

export { BENCHMARKS };
