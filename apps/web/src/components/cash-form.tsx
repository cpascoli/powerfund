"use client";

import { useActionState } from "react";

import { saveCash, type CashActionState } from "@/lib/actions/cash";

const initialState: CashActionState = { error: null, ok: false };

type Props = {
  cash: number;
  notes?: string | null;
};

export function CashForm({ cash, notes }: Props) {
  const [state, formAction, pending] = useActionState(saveCash, initialState);

  return (
    <form className="research-form" action={formAction}>
      <div className="form-row-2">
        <label>
          Cash (USD)
          <input
            name="cash"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={cash.toFixed(2)}
          />
        </label>
        <label>
          Notes
          <input
            name="notes"
            type="text"
            defaultValue={notes ?? ""}
            placeholder="e.g. $250k allocated; BTC/gold outside"
          />
        </label>
      </div>
      {state.error ? <p className="form-error">{state.error}</p> : null}
      {state.ok ? <p className="muted">Cash updated.</p> : null}
      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Update cash"}
      </button>
    </form>
  );
}
