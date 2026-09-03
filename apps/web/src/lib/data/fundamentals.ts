import { resolveDb, type DbClient } from "@/lib/supabase/db";

export type FundamentalVintage = {
  periodEnd: string;
  fiscalPeriod: string | null;
  /** Vendor filing date, when there is one. */
  filedAt: string | null;
  /** Earliest date this observation could have been known. */
  knowableAt: string;
  knowableBasis: "filing" | "estimated";
  observedAt: string;
  revenue: number | null;
  freeCashFlow: number | null;
  capex: number | null;
  netDebt: number | null;
  sharesDiluted: number | null;
  currency: string;
  source: string;
};

type VintageRow = {
  period_end: string;
  fiscal_period: string | null;
  filed_at: string | null;
  knowable_at: string;
  knowable_basis: string;
  observed_at: string;
  revenue: number | null;
  free_cash_flow: number | null;
  capex: number | null;
  net_debt: number | null;
  shares_diluted: number | null;
  currency: string;
  source: string;
};

function toVintage(row: VintageRow): FundamentalVintage {
  return {
    periodEnd: row.period_end,
    fiscalPeriod: row.fiscal_period,
    filedAt: row.filed_at,
    knowableAt: row.knowable_at,
    knowableBasis: row.knowable_basis === "filing" ? "filing" : "estimated",
    observedAt: row.observed_at,
    revenue: row.revenue,
    freeCashFlow: row.free_cash_flow,
    capex: row.capex,
    netDebt: row.net_debt,
    sharesDiluted: row.shares_diluted,
    currency: row.currency,
    source: row.source,
  };
}

/**
 * The fundamentals we could have known on `asOf` — one row per period, oldest
 * first, each the newest observation that had already been filed by then. A
 * restatement filed later is invisible.
 *
 * This is the query a scorer or a backtest must use. Reading
 * `fundamentals_quarterly` gives current knowledge, which is correct for live
 * scoring and look-ahead biased for anything historical.
 *
 * `includeEstimated: false` drops quarters whose filing date had to be assumed
 * because the vendor publishes none, for a run that will not tolerate a guessed
 * date in the information set.
 */
export async function fundamentalsAsOf(
  instrumentId: string,
  asOf: string,
  options?: { includeEstimated?: boolean; client?: DbClient },
): Promise<FundamentalVintage[]> {
  const supabase = await resolveDb(options?.client);
  const { data, error } = await supabase.rpc("fundamentals_as_of", {
    p_instrument_id: instrumentId,
    p_as_of: asOf,
    p_include_estimated: options?.includeEstimated ?? true,
  });
  if (error) {
    throw new Error(`Failed to load fundamentals as of ${asOf}: ${error.message}`);
  }
  return ((data as VintageRow[] | null) ?? []).map(toVintage);
}

/** Every observation of one quarter, oldest first. The restatement history. */
export async function vintagesForPeriod(
  instrumentId: string,
  periodEnd: string,
  client?: DbClient,
): Promise<FundamentalVintage[]> {
  const supabase = await resolveDb(client);
  const { data, error } = await supabase
    .from("fundamentals_vintages")
    .select(
      "period_end, fiscal_period, filed_at, knowable_at, knowable_basis, observed_at, revenue, free_cash_flow, capex, net_debt, shares_diluted, currency, source",
    )
    .eq("instrument_id", instrumentId)
    .eq("period_end", periodEnd)
    .order("knowable_at", { ascending: true })
    .order("observed_at", { ascending: true });
  if (error) {
    throw new Error(`Failed to load vintages: ${error.message}`);
  }
  return ((data as VintageRow[] | null) ?? []).map(toVintage);
}
