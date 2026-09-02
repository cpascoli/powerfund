import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminEnv } from "./env";

export type AdminDb = SupabaseClient;

export function createAdminDb(): AdminDb {
  const { url, serviceRoleKey } = getSupabaseAdminEnv();
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type WatchInstrument = {
  id: string;
  symbol: string;
  dataSymbol: string | null;
  isBenchmark: boolean;
};

export async function listWatchInstruments(
  db: AdminDb,
  options?: { researchOnly?: boolean },
): Promise<WatchInstrument[]> {
  const { data, error } = await db
    .from("instruments")
    .select("id, symbol, data_symbol, is_benchmark")
    .neq("status", "archived")
    .order("symbol", { ascending: true });

  if (error) {
    throw new Error(`Failed to list instruments: ${error.message}`);
  }

  const rows = ((data as Array<{
    id: string;
    symbol: string;
    data_symbol: string | null;
    is_benchmark: boolean;
  }> | null) ?? []).map((row) => ({
    id: row.id,
    symbol: row.symbol,
    dataSymbol: row.data_symbol,
    isBenchmark: row.is_benchmark,
  }));

  return options?.researchOnly
    ? rows.filter((row) => !row.isBenchmark)
    : rows;
}
