"use client";

import { useActionState, useState } from "react";

import {
  recordCashEntry,
  type CashEntryKind,
  type CashEntryState,
} from "@/lib/actions/cash-entry";

const initialState: CashEntryState = { error: null, ok: false };

export function CashEntryForm() {
  const [state, formAction, pending] = useActionState(
    recordCashEntry,
    initialState,
  );
  const [kind, setKind] = useState<CashEntryKind>("deposit");

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const occurredDefault = now.toISOString().slice(0, 16);

  return (
    <form className="research-form" action={formAction}>
      <div className="form-row-2">
        <label>
          Entry
          <select
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as CashEntryKind)}
          >
            <option value="deposit">Deposit — capital in</option>
            <option value="withdrawal">Withdrawal — capital out</option>
            <option value="adjustment">Adjustment — correct an error</option>
          </select>
        </label>
        <label>
          Amount (USD)
          <input
            name="amount"
            type="number"
            step="0.01"
            required
            placeholder={kind === "adjustment" ? "-0.06" : "25000.00"}
          />
        </label>
      </div>

      <label>
        Dated
        <input
          name="occurred_at"
          type="datetime-local"
          defaultValue={occurredDefault}
          required
        />
      </label>

      <label>
        Note
        <input
          name="notes"
          type="text"
          placeholder={
            kind === "adjustment"
              ? "What this corrects, and why"
              : "e.g. transfer from Coinbase"
          }
        />
      </label>

      <p className="muted">
        {kind === "adjustment"
          ? "Signed: negative reduces cash. Use this to correct a mistake rather than editing history, which the ledger forbids."
          : "Enter a positive amount; the direction comes from the entry type."}
      </p>

      {state.error ? <p className="form-error">{state.error}</p> : null}
      {state.ok ? <p className="muted">Entry recorded.</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Recording…" : "Record entry"}
      </button>
    </form>
  );
}
