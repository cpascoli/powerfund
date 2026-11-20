import {
  priceDataStale,
  splitRatioLabel,
  type BookIntegrity,
} from "@powerfund/domain";
import type { Database } from "@powerfund/db";
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient<Database>;

/** Latest SPY session in market_bars. That is the market-data calendar for TWR and contribution. */
export async function loadSuccessBenchmarkThrough(
  db: Db,
): Promise<string | null> {
  const { data: bench, error: benchError } = await db
    .from("benchmarks")
    .select("instrument_id")
    .eq("role", "success")
    .maybeSingle();
  if (benchError) {
    throw new Error(`Failed to load SPY calendar: ${benchError.message}`);
  }
  const spyId = (bench as { instrument_id: string } | null)?.instrument_id;
  if (spyId == null) return null;
  const { data: bar, error: barError } = await db
    .from("market_bars")
    .select("bar_date")
    .eq("instrument_id", spyId)
    .order("bar_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (barError) {
    throw new Error(`Failed to load SPY bars: ${barError.message}`);
  }
  return (bar as { bar_date: string } | null)?.bar_date ?? null;
}

export function freshnessPayload(
  through: string | null,
  asOfIso: string = new Date().toISOString(),
) {
  return {
    price_data_through: through,
    price_data_stale: priceDataStale(through, asOfIso),
  };
}

/**
 * Freshness plus whether the valuation can be leaned on.
 *
 * `price_data_stale` used to be a statement about the newest close in the
 * response. On 19 November 2026 that was current while six holdings were
 * marked from the day before, so the flag said "fresh" over a book that was
 * half a day old — and it had no way at all to say that one holding was being
 * valued on the wrong share basis. With an integrity assessment it is true
 * when *any* open holding lacks the last completed session, the laggards are
 * named, and `valuation_provisional` says whether NAV, returns, drawdown and
 * risk in this response are fit to act on.
 *
 * `integrity` is null when the check could not run. That is reported as
 * provisional: not knowing is not the same as fine.
 */
export function integrityPayload(
  through: string | null,
  integrity: BookIntegrity | null | undefined,
  asOfIso: string = new Date().toISOString(),
) {
  const base = freshnessPayload(through, asOfIso);
  if (integrity === undefined) return base;
  if (integrity === null) {
    return {
      ...base,
      valuation_provisional: true,
      valuation_warnings: [
        "The valuation integrity check could not run; treat NAV, returns and risk as unverified.",
      ],
    };
  }
  return {
    price_data_through: base.price_data_through,
    price_data_stale: base.price_data_stale || integrity.stale,
    price_data_expected_session: integrity.expectedSession,
    price_data_missing: integrity.missingCloses.map((row) => ({
      symbol: row.symbol,
      last_close_session: row.through,
    })),
    corporate_actions_pending: integrity.pendingCorporateActions.map((row) => ({
      symbol: row.symbol,
      type: "split",
      ratio: splitRatioLabel(row),
      effective_date: row.effectiveDate,
      source: row.source,
      held: row.held,
    })),
    valuation_provisional: integrity.provisional,
    valuation_warnings: integrity.warnings,
  };
}

/** One line telling an agent how to read the fields above. */
export const INTEGRITY_NOTE =
  "price_data_stale is true when any open holding lacks the last completed US cash session; price_data_missing names them. corporate_actions_pending lists splits registered but not applied. When valuation_provisional is true, NAV, returns, drawdown and risk here are not reliable inputs for a deployment decision: say so and stop, do not reason around it.";
