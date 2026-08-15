import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@powerfund/db";

/** Server-only. Never import from client components. */
export function createAdminClient(): SupabaseClient<Database> | null {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
