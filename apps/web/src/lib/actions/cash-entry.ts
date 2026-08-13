"use server";

import { revalidatePath } from "next/cache";
import { toCents } from "@powerfund/domain";
import type { Database } from "@powerfund/db";

import { createClient } from "@/lib/supabase/server";

type TransactionInsert = Database["public"]["Tables"]["transactions"]["Insert"];

export type CashEntryKind = "deposit" | "withdrawal" | "adjustment";

export type CashEntryState = {
  error: string | null;
  ok: boolean;
};

function emptyToNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function parseKind(raw: string | null): CashEntryKind | null {
  switch (raw) {
    case "deposit":
    case "withdrawal":
    case "adjustment":
      return raw;
    default:
      return null;
  }
}

/** Signed cash effect. Deposits and withdrawals take a magnitude; an adjustment
 * is signed by the operator because it can go either way. */
function cashDeltaFor(kind: CashEntryKind, amount: number): number {
  switch (kind) {
    case "deposit":
      return toCents(Math.abs(amount));
    case "withdrawal":
      return -toCents(Math.abs(amount));
    case "adjustment":
      return toCents(amount);
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/**
 * Posts a cash movement to the ledger. Cash is a projection, so this is the only
 * way the balance changes outside of trades.
 */
export async function recordCashEntry(
  _prev: CashEntryState,
  formData: FormData,
): Promise<CashEntryState> {
  const kind = parseKind(emptyToNull(formData.get("kind")));
  const amountRaw = emptyToNull(formData.get("amount"));
  const occurredRaw = emptyToNull(formData.get("occurred_at"));
  const notes = emptyToNull(formData.get("notes"));

  if (!kind) {
    return { error: "Pick deposit, withdrawal or adjustment.", ok: false };
  }

  const amount = amountRaw == null ? NaN : Number(amountRaw);
  if (!Number.isFinite(amount) || amount === 0) {
    return { error: "Amount must be a non-zero number.", ok: false };
  }
  if (kind !== "adjustment" && amount < 0) {
    return {
      error: `Enter a positive amount and choose ${
        amount < 0 ? "withdrawal" : "deposit"
      } as the direction.`,
      ok: false,
    };
  }

  const occurredAt = occurredRaw
    ? new Date(occurredRaw).toISOString()
    : new Date().toISOString();
  if (Number.isNaN(Date.parse(occurredAt))) {
    return { error: "Invalid date.", ok: false };
  }

  if (kind === "adjustment" && !notes) {
    return {
      error: "An adjustment needs a note explaining what it corrects.",
      ok: false,
    };
  }

  const cashDelta = cashDeltaFor(kind, amount);
  const supabase = await createClient();

  // The `cash >= 0` constraint is the real backstop; this gives a better message.
  if (cashDelta < 0) {
    const { data: state } = await supabase
      .from("portfolio_state")
      .select("cash")
      .limit(1)
      .maybeSingle();
    const cash = Number(state?.cash ?? 0);
    if (cash + cashDelta < 0) {
      return {
        error: `Only ${cash.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
        })} of cash is available.`,
        ok: false,
      };
    }
  }

  const entry: TransactionInsert = {
    occurred_at: occurredAt,
    kind,
    cash_delta: cashDelta,
    notes,
  };

  const { error } = await supabase.from("transactions").insert(entry);
  if (error) {
    return { error: error.message, ok: false };
  }

  revalidatePath("/portfolio");
  revalidatePath("/");
  return { error: null, ok: true };
}
