import type { DbClient } from "@/lib/supabase/db";

export type BookedByKey = {
  transactionId: string;
  decisionId: string | null;
  decisionType: "enter" | "add" | null;
  positionId: string | null;
  /** False after a full exit, which is a real answer rather than a missing one. */
  positionOpen: boolean;
};

/**
 * The fill this submit would create, if it already exists.
 *
 * Both booking paths write the ledger first and can still fail afterwards —
 * linking the position, copying kill criteria, updating the queue — and they
 * return `{ ok: false }` when they do, with the money already moved. That makes
 * retrying the obvious response and the wrong one. A key carried on the form
 * turns the retry into a lookup: same key, same fill, nothing booked twice.
 *
 * Returns facts rather than a result, because the two callers shape them
 * differently and a shared result type would fit neither.
 */
export async function bookedByClientKey(
  supabase: DbClient,
  clientKey: string,
  instrumentId: string,
): Promise<BookedByKey | null> {
  const { data } = await supabase
    .from("transactions")
    .select("id, decision_id")
    .eq("client_key", clientKey)
    .maybeSingle();
  if (!data) return null;

  const row = data as { id: string; decision_id: string | null };

  const { data: position } = await supabase
    .from("positions")
    .select("id")
    .eq("instrument_id", instrumentId)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();

  let decisionType: "enter" | "add" | null = null;
  if (row.decision_id) {
    const { data: decision } = await supabase
      .from("decisions")
      .select("decision_type")
      .eq("id", row.decision_id)
      .maybeSingle();
    const stored = (decision as { decision_type: string } | null)?.decision_type;
    if (stored === "enter" || stored === "add") decisionType = stored;
  }

  return {
    transactionId: row.id,
    decisionId: row.decision_id,
    decisionType,
    positionId: (position as { id: string } | null)?.id ?? null,
    positionOpen: position != null,
  };
}
