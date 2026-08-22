import { priceDataStale, utcDay } from "@powerfund/domain";
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
    price_data_stale: priceDataStale(through, utcDay(asOfIso)),
  };
}
