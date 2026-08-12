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
};

export async function listWatchInstruments(
  db: AdminDb,
): Promise<WatchInstrument[]> {
  const { data, error } = await db
    .from("instruments")
    .select("id, symbol")
    .neq("status", "archived")
    .order("symbol", { ascending: true });

  if (error) {
    throw new Error(`Failed to list instruments: ${error.message}`);
  }

  return (data as WatchInstrument[] | null) ?? [];
}
