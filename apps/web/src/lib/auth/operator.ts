import { createClient, getSessionUser } from "@/lib/supabase/server";

export type AppRole = "operator" | "viewer";

/**
 * Role of the signed-in account, or `null` when nobody is signed in.
 *
 * `app_users` defaults new accounts to `viewer`, so an unexpected signup can read
 * at worst. Reads are currently open to any authenticated account; writes are
 * gated by RLS on `is_operator()`. Without an app-layer check the UI happily
 * renders "Add fill" to a viewer and then surfaces a raw Postgres RLS error when
 * they use it, which is how a read-only guest learns they were never trusted.
 */
export async function getSessionRole(): Promise<AppRole | null> {
  const user = await getSessionUser();
  if (user == null) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("app_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    // Fail closed: an unreadable role is not an operator.
    return "viewer";
  }
  return (data as { role: AppRole } | null)?.role ?? "viewer";
}

export async function isOperator(): Promise<boolean> {
  return (await getSessionRole()) === "operator";
}

export type OperatorDenied = { ok: false; error: string };

const DENIED =
  "This account has read-only access to the book. Only the operator can change positions, cash, the queue, dossiers, or the journal.";

/**
 * Guard for every mutating server action. RLS is still the boundary that
 * actually protects the data; this is defence in depth and, just as importantly,
 * the difference between a clear message and a raw Postgres error.
 */
export async function requireOperator(): Promise<OperatorDenied | null> {
  return (await isOperator()) ? null : { ok: false, error: DENIED };
}
