import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

export type PowerFundDb = SupabaseClient<Database>;

export function createPowerFundClient(args: {
  url: string;
  anonKey: string;
}): PowerFundDb {
  return createClient<Database>(args.url, args.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}
