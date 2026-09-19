import { createAdminDb, type AdminDb } from "../db";

export type LedgerCheck = {
  checkName: string;
  expected: number | null;
  actual: number | null;
  ok: boolean;
};

export type BookVerification = {
  checks: LedgerCheck[];
  failed: LedgerCheck[];
  guardsDisabled: string[];
};

/**
 * Reconcile the projection against the ledger, and confirm the ledger is still
 * the kind of thing worth reconciling against.
 *
 * `verify_book_against_ledger()` has existed and been covered by the SQL suite
 * since August, and until 19 September 2026 had never been run where the money
 * is. It recomputes cash and every position quantity from `transactions` and
 * compares them to `portfolio_state` and `positions`, so it catches a
 * projection that has drifted from its source the day it happens rather than at
 * the next review.
 *
 * The guard check rides along because the reconciliation alone cannot see the
 * failure that would matter most. It compares a projection to the ledger; if the
 * ledger itself were edited, both sides move together and the comparison still
 * passes. A disabled append-only trigger is what would allow that, so the run
 * asks whether the guards are armed as well as whether the numbers agree.
 */
export async function verifyBookAgainstLedger(
  client?: AdminDb,
): Promise<BookVerification> {
  const db = client ?? createAdminDb();

  const { data, error } = await db.rpc("verify_book_against_ledger");
  if (error) {
    throw new Error(`Failed to verify the book against the ledger: ${error.message}`);
  }

  const checks = ((data as Array<{
    check_name: string;
    expected: number | string | null;
    actual: number | string | null;
    ok: boolean;
  }> | null) ?? []).map((row) => ({
    checkName: row.check_name,
    expected: row.expected == null ? null : Number(row.expected),
    actual: row.actual == null ? null : Number(row.actual),
    ok: row.ok,
  }));

  if (checks.length === 0) {
    throw new Error(
      "verify_book_against_ledger() returned no checks — the reconciliation did not run.",
    );
  }

  const { data: guardData, error: guardError } = await db.rpc(
    "ledger_guard_status",
  );
  if (guardError) {
    throw new Error(`Failed to read the ledger guards: ${guardError.message}`);
  }
  const guards = (guardData as Array<{
    trigger_name: string;
    enabled: boolean;
  }> | null) ?? [];
  if (guards.length === 0) {
    throw new Error("ledger_guard_status() returned nothing — guards unknown.");
  }

  return {
    checks,
    failed: checks.filter((row) => !row.ok),
    guardsDisabled: guards
      .filter((row) => !row.enabled)
      .map((row) => row.trigger_name),
  };
}

export function printBookVerification(result: BookVerification): void {
  for (const row of result.failed) {
    console.error(
      `[verify:book] MISMATCH ${row.checkName}: ledger says ${row.expected}, book says ${row.actual}`,
    );
  }
  for (const name of result.guardsDisabled) {
    console.error(`[verify:book] GUARD DISABLED ${name}`);
  }
  console.log(
    `[verify:book] ${result.checks.length} checks, ${result.failed.length} failing, ${result.guardsDisabled.length} guard(s) disabled`,
  );
}
