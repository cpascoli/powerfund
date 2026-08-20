import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@powerfund/db";

import { createClient } from "./server";

export type DbClient = SupabaseClient<Database>;

export async function resolveDb(client?: DbClient): Promise<DbClient> {
  return client ?? (await createClient());
}
