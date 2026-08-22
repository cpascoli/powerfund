"use client";

import { useActionState } from "react";

import {
  savePosition,
  type PositionActionState,
} from "@/lib/actions/positions";
import type { InstrumentWithTheme } from "@/lib/data/research";

const initialState: PositionActionState = { error: null };

type Props = {
  instruments: InstrumentWithTheme[];
  defaults?: {
    instrumentId?: string;
    quantity?: string;
    avgCost?: string;
    thesisSummary?: string;
  };
};

export function PositionForm({ instruments, defaults }: Props) {
  const [state, formAction, pending] = useActionState(
    savePosition,
    initialState,
  );

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const openedDefault = now.toISOString().slice(0, 16);

  return (
    <form className="research-form" action={formAction}>
      <label>
        Instrument
        <select
          name="instrument_id"
          defaultValue={defaults?.instrumentId ?? ""}
          required
        >
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
          Quantity
          <input
            name="quantity"
            type="number"
            step="any"
            min="0"
            required
            defaultValue={defaults?.quantity ?? ""}
            placeholder="16.86133"
          />
        </label>
        <label>
          Avg buy price
          <input
            name="avg_cost"
            type="number"
            step="any"
            min="0"
            required
            defaultValue={defaults?.avgCost ?? ""}
            placeholder="296.54"
          />
        </label>
      </div>

      <div className="form-row-2">
        <label>
          Fees (USD)
          <input name="fees" type="number" step="0.01" min="0" defaultValue="0" />
        </label>
        <label>
          Opened at
          <input
            name="opened_at"
            type="datetime-local"
            defaultValue={openedDefault}
            required
          />
        </label>
      </div>
      <p className="muted">
        Cost basis is quantity x price plus fees, which is what leaves your cash
        and what UK CGT treats as the cost.
      </p>

      <label>
        Thesis summary
        <textarea
          name="thesis_summary"
          rows={3}
          defaultValue={defaults?.thesisSummary ?? ""}
          placeholder="Why this position exists"
        />
      </label>

      <label>
        Invalidation
        <textarea
          name="invalidation"
          rows={2}
          placeholder="What would force an exit or cut"
        />
      </label>

      <label>
        Mandate override reason
        <textarea
          name="mandate_override_reason"
          rows={2}
          placeholder="Required only if this fill would breach a cap, the cash floor, the phase-1 cap, the Phase-2 drawdown halt, or the 40% NAV AI-capex factor"
        />
      </label>

      <label className="checkbox-row">
        <input name="log_decision" type="checkbox" defaultChecked />
        Also log an enter decision in the Journal
      </label>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Add position"}
      </button>
    </form>
  );
}
