"use client";

import { useActionState } from "react";

import {
  savePlannedAction,
  type PlannedActionState,
} from "@/lib/actions/planned-actions";
import type { InstrumentWithTheme } from "@/lib/data/research";

const initialState: PlannedActionState = { error: null };

type Props = {
  instruments: InstrumentWithTheme[];
};

export function PlannedActionForm({ instruments }: Props) {
  const [state, formAction, pending] = useActionState(
    savePlannedAction,
    initialState,
  );

  return (
    <form className="research-form" action={formAction}>
      <label>
        Instrument
        <select name="instrument_id" defaultValue="" required>
          <option value="" disabled>
            Select…
          </option>
          {instruments.map((instrument) => (
            <option key={instrument.id} value={instrument.id}>
              {instrument.symbol} — {instrument.name}
            </option>
          ))}
        </select>
      </label>

      <div className="form-row-2">
        <label>
          Action
          <select name="action_type" defaultValue="buy">
            <option value="buy">Buy (new)</option>
            <option value="add">Add (to existing)</option>
          </select>
        </label>
        <label>
          Planned amount (USD)
          <input
            name="planned_usd"
            type="number"
            step="1"
            min="1"
            required
            placeholder="4500"
          />
        </label>
      </div>

      <div className="form-row-2">
        <label>
          Window
          <input
            name="window_label"
            type="text"
            placeholder="this week / after Investor Day"
          />
        </label>
        <label>
          Due by
          <input name="due_by" type="date" />
        </label>
      </div>

      <label>
        Why (one line)
        <input
          name="rationale"
          type="text"
          placeholder="Starter stub; add only on new information"
        />
      </label>

      <label>
        Mandate override reason
        <textarea
          name="mandate_override_reason"
          rows={2}
          placeholder="Required only if this planned buy would breach a cap, the cash floor, the phase-1 cap, the Phase-2 drawdown halt, or the 40% NAV AI-capex factor"
        />
      </label>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Add to queue"}
      </button>
    </form>
  );
}
