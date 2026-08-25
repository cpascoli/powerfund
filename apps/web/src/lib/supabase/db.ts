import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@powerfund/db";

import { createAdminClient } from "./admin";
import { createClient } from "./server";

export type DbClient = SupabaseClient<Database>;

/**
 * Server reads. Prefer the service-role client so public pages can load the
 * research catalog without granting `anon` table privileges. Writes still go
 * through the cookie session in server actions.
 */
export async function resolveDb(client?: DbClient): Promise<DbClient> {
  if (client) return client;
  const admin = createAdminClient();
  if (admin) return admin;
  return createClient();
}
