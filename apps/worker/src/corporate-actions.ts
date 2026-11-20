import { loadBookIntegrity } from "@powerfund/db";
import {
  planDetectedSplit,
  splitRatioLabel,
  type BookIntegrity,
  type CorporateActionSource,
  type CorporateActionStatus,
  type DetectedSplit,
  type KnownSplit,
} from "@powerfund/domain";

import { createAdminDb, type AdminDb } from "./db";

type ActionRow = {
  id: string;
  instrument_id: string;
  effective_date: string;
  split_numerator: number;
  split_denominator: number;
  status: CorporateActionStatus;
  source: CorporateActionSource;
  verified_by: string | null;
  verification_notes: string | null;
  fractional_treatment: string | null;
  applied_at: string | null;
  notes: string | null;
  instruments?: { symbol: string } | Array<{ symbol: string }> | null;
};

const COLUMNS =
  "id, instrument_id, effective_date, split_numerator, split_denominator, status, source, " +
  "verified_by, verification_notes, fractional_treatment, applied_at, notes";

function toKnown(row: ActionRow): KnownSplit {
  return {
    id: row.id,
    status: row.status,
    effectiveDate: row.effective_date,
    numerator: Number(row.split_numerator),
    denominator: Number(row.split_denominator),
    source: row.source,
  };
}

/**
 * Open a pending split for something ingest noticed, unless we already know.
 *
 * Returns a one-line note for the ingest log, or null when there was nothing
 * to say. It never throws: a split is worth recording, but failing to record
 * one must not stop the bars for the other sixty names from landing. The
 * book-integrity check catches an unregistered split from the data itself, so
 * a lost note here delays the warning by nothing.
 *
 * This only ever writes `pending`. Applying is the operator's, deliberately.
 */
export async function recordDetectedSplit(
  db: AdminDb,
  instrument: { id: string; symbol: string },
  detected: DetectedSplit,
  evidence: Record<string, unknown>,
): Promise<string | null> {
  try {
    const { data, error } = await db
      .from("corporate_actions")
      .select(COLUMNS)
      .eq("instrument_id", instrument.id)
      .eq("action_type", "split");
    if (error) throw new Error(error.message);
    const known = ((data as unknown as ActionRow[] | null) ?? []).map(toKnown);

    const plan = planDetectedSplit(known, detected);
    const label = `${splitRatioLabel(detected)} split effective ${detected.effectiveDate}`;
    if (plan.action === "ignore") return null;

    if (plan.action === "update") {
      const { error: updateError } = await db
        .from("corporate_actions")
        .update({
          effective_date: detected.effectiveDate,
          source: detected.source,
          evidence,
        })
        .eq("id", plan.id)
        .eq("status", "pending");
      if (updateError) throw new Error(updateError.message);
      return `SPLIT PENDING (date corrected by ${detected.source}): ${label}`;
    }

    const { error: insertError } = await db.from("corporate_actions").insert({
      instrument_id: instrument.id,
      action_type: "split",
      effective_date: detected.effectiveDate,
      split_numerator: detected.numerator,
      split_denominator: detected.denominator,
      source: detected.source,
      evidence,
    });
    if (insertError) throw new Error(insertError.message);
    return `SPLIT PENDING (${detected.source}): ${label} — verify, then splits:apply`;
  } catch (error) {
    return `SPLIT NOT RECORDED: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export type SplitListing = {
  id: string;
  symbol: string;
  ratio: string;
  effectiveDate: string;
  status: CorporateActionStatus;
  source: CorporateActionSource;
  verifiedBy: string | null;
  appliedAt: string | null;
};

export async function listSplits(client?: AdminDb): Promise<SplitListing[]> {
  const db = client ?? createAdminDb();
  const { data, error } = await db
    .from("corporate_actions")
    .select(`${COLUMNS}, instruments(symbol)`)
    .order("effective_date", { ascending: false });
  if (error) throw new Error(`Failed to list corporate actions: ${error.message}`);
  return ((data as unknown as ActionRow[] | null) ?? []).map((row) => {
    const link = Array.isArray(row.instruments) ? row.instruments[0] : row.instruments;
    return {
      id: row.id,
      symbol: link?.symbol ?? row.instrument_id,
      ratio: splitRatioLabel({
        numerator: Number(row.split_numerator),
        denominator: Number(row.split_denominator),
      }),
      effectiveDate: row.effective_date,
      status: row.status,
      source: row.source,
      verifiedBy: row.verified_by,
      appliedAt: row.applied_at,
    };
  });
}

function parseRatio(value: string): { numerator: number; denominator: number } {
  const match = /^(\d+)\s*[:/]\s*(\d+)$/.exec(value.trim());
  if (match == null) {
    throw new Error(`--ratio must look like 8:1 (new:old), got "${value}"`);
  }
  return { numerator: Number(match[1]), denominator: Number(match[2]) };
}

/** Register a split by hand. It lands pending, like any other. */
export async function registerSplit(args: {
  symbol: string;
  effectiveDate: string;
  ratio: string;
  notes?: string;
}): Promise<string> {
  const db = createAdminDb();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.effectiveDate)) {
    throw new Error("--effective must be YYYY-MM-DD: the first session on the new basis");
  }
  const ratio = parseRatio(args.ratio);
  const { data: instrument, error } = await db
    .from("instruments")
    .select("id, symbol")
    .eq("symbol", args.symbol.toUpperCase())
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = instrument as { id: string; symbol: string } | null;
  if (row == null) throw new Error(`No instrument ${args.symbol}`);

  const { data: inserted, error: insertError } = await db
    .from("corporate_actions")
    .insert({
      instrument_id: row.id,
      action_type: "split",
      effective_date: args.effectiveDate,
      split_numerator: ratio.numerator,
      split_denominator: ratio.denominator,
      source: "manual",
      notes: args.notes ?? null,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);
  return (inserted as { id: string }).id;
}

/**
 * Apply a pending split. The database does the work: the settle trigger
 * re-projects the open position and refuses anything it cannot do safely.
 * `.eq("status", "pending")` makes a second call a no-op rather than an
 * error, and the count returned says which it was.
 */
export async function applySplit(args: {
  id: string;
  verifiedBy: string;
  notes: string;
  fractional?: string;
}): Promise<boolean> {
  const db = createAdminDb();
  const { data, error } = await db
    .from("corporate_actions")
    .update({
      status: "applied",
      verified_by: args.verifiedBy,
      verification_notes: args.notes,
      ...(args.fractional ? { fractional_treatment: args.fractional } : {}),
    })
    .eq("id", args.id)
    .eq("status", "pending")
    .select("id");
  if (error) throw new Error(`Failed to apply the split: ${error.message}`);
  return ((data as Array<{ id: string }> | null) ?? []).length === 1;
}

export async function rejectSplit(args: { id: string; notes: string }): Promise<boolean> {
  const db = createAdminDb();
  const { data, error } = await db
    .from("corporate_actions")
    .update({ status: "rejected", notes: args.notes })
    .eq("id", args.id)
    .eq("status", "pending")
    .select("id");
  if (error) throw new Error(`Failed to reject the split: ${error.message}`);
  return ((data as Array<{ id: string }> | null) ?? []).length === 1;
}

export async function checkBookIntegrity(now?: Date): Promise<BookIntegrity> {
  return loadBookIntegrity(createAdminDb(), now ?? new Date());
}

export function printBookIntegrity(result: BookIntegrity): void {
  for (const warning of result.warnings) {
    console.error(`[book:integrity] ${warning}`);
  }
  console.log(
    `[book:integrity] expected session ${result.expectedSession}; ` +
      `${result.missingCloses.length} holding(s) missing a close, ` +
      `${result.pendingCorporateActions.length} pending corporate action(s), ` +
      `${result.basisMismatches.length} share-basis mismatch(es) — ` +
      (result.provisional ? "valuation is PROVISIONAL" : "valuation is reliable"),
  );
}
