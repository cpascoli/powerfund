import type {
  HistoricalBar,
  HistoricalCap,
  InstrumentHistory,
  QuarterVintage,
} from "@powerfund/domain";

import type { AdminDb } from "../db";

/**
 * An instrument's whole observable history, loaded once.
 *
 * The scorer used to read the latest fundamentals row, the last 400 bars and
 * the newest market cap. That is only correct for scoring today; asking what it
 * would have said in the past needs the series, not the tip. Loading everything
 * once and slicing in memory also keeps a replay to one round trip per name
 * instead of one per name per date.
 */

/** PostgREST caps a response at 1,000 rows; five years of bars is more than that. */
const PAGE = 1000;

async function selectAllPages<T>(
  build: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
  label: string,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const page = data ?? [];
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

type VintageRow = {
  period_end: string;
  knowable_at: string;
  observed_at: string;
  revenue: number | null;
  capex: number | null;
  free_cash_flow: number | null;
  net_debt: number | null;
  shares_diluted: number | null;
};

type BarRow = {
  bar_date: string;
  close: number | null;
  adj_close: number | null;
};

type CapRow = { as_of_date: string; market_cap: number };

export async function loadInstrumentHistory(
  db: AdminDb,
  instrumentId: string,
): Promise<InstrumentHistory> {
  const [vintageRows, barRows, capRows] = await Promise.all([
    selectAllPages<VintageRow>(
      (from, to) =>
        db
          .from("fundamentals_vintages")
          .select(
            "period_end, knowable_at, observed_at, revenue, capex, free_cash_flow, net_debt, shares_diluted",
          )
          .eq("instrument_id", instrumentId)
          .order("period_end", { ascending: true })
          .order("knowable_at", { ascending: true })
          .range(from, to) as PromiseLike<{
          data: VintageRow[] | null;
          error: { message: string } | null;
        }>,
      "fundamentals_vintages",
    ),
    selectAllPages<BarRow>(
      (from, to) =>
        db
          .from("market_bars")
          .select("bar_date, close, adj_close")
          .eq("instrument_id", instrumentId)
          .order("bar_date", { ascending: true })
          .range(from, to) as PromiseLike<{
          data: BarRow[] | null;
          error: { message: string } | null;
        }>,
      "market_bars",
    ),
    selectAllPages<CapRow>(
      (from, to) =>
        db
          .from("market_caps")
          .select("as_of_date, market_cap")
          .eq("instrument_id", instrumentId)
          .order("as_of_date", { ascending: true })
          .range(from, to) as PromiseLike<{
          data: CapRow[] | null;
          error: { message: string } | null;
        }>,
      "market_caps",
    ),
  ]);

  const vintages: QuarterVintage[] = vintageRows.map((row) => ({
    periodEnd: row.period_end,
    knowableAt: row.knowable_at,
    observedAt: row.observed_at,
    revenue: row.revenue == null ? null : Number(row.revenue),
    capex: row.capex == null ? null : Number(row.capex),
    freeCashFlow: row.free_cash_flow == null ? null : Number(row.free_cash_flow),
    netDebt: row.net_debt == null ? null : Number(row.net_debt),
    sharesDiluted:
      row.shares_diluted == null ? null : Number(row.shares_diluted),
    ingestedAt: row.observed_at,
  }));

  const bars: HistoricalBar[] = [];
  for (const row of barRows) {
    const close = row.adj_close ?? row.close;
    if (close == null) continue;
    bars.push({ date: row.bar_date, close: Number(close) });
  }

  const caps: HistoricalCap[] = capRows.map((row) => ({
    date: row.as_of_date,
    marketCap: Number(row.market_cap),
  }));

  return { vintages, bars, caps };
}

/** Trading sessions from the success benchmark, ascending. */
export async function loadSessionCalendar(
  db: AdminDb,
  from?: string,
): Promise<string[]> {
  const { data: bench, error: benchError } = await db
    .from("benchmarks")
    .select("instrument_id")
    .eq("role", "success")
    .maybeSingle();
  if (benchError) throw new Error(benchError.message);
  const spyId = (bench as { instrument_id: string } | null)?.instrument_id;
  if (spyId == null) return [];

  const rows = await selectAllPages<{ bar_date: string }>(
    (start, end) => {
      let query = db
        .from("market_bars")
        .select("bar_date")
        .eq("instrument_id", spyId);
      if (from) query = query.gte("bar_date", from);
      return query.order("bar_date", { ascending: true }).range(start, end) as PromiseLike<{
        data: Array<{ bar_date: string }> | null;
        error: { message: string } | null;
      }>;
    },
    "session calendar",
  );
  return rows.map((row) => row.bar_date);
}
