"use client";

import { useActionState } from "react";

import {
  confirmPlannedAction,
  type PlannedActionState,
} from "@/lib/actions/planned-actions";
import type { PlannedActionRow } from "@/lib/data/planned-actions";

const initialState: PlannedActionState = { error: null };

type Props = {
  action: PlannedActionRow;
};

export function ConfirmFillForm({ action }: Props) {
  const [state, formAction, pending] = useActionState(
    confirmPlannedAction,
    initialState,
  );

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const filledDefault = now.toISOString().slice(0, 16);

  return (
    <form className="research-form" action={formAction}>
      <input type="hidden" name="id" value={action.id} />
      <p className="muted">
        Planned {action.actionType} {action.symbol} · $
        {action.plannedUsd.toLocaleString()}
        {action.windowLabel ? ` · ${action.windowLabel}` : ""}. Enter the actual
        fill.
      </p>

      <div className="form-row-2">
        <label>
          Shares bought
          <input
            name="quantity"
            type="number"
            step="any"
            min="0"
            required
            placeholder="12.5"
          />
        </label>
        <label>
          Price per share
          <input
            name="price"
            type="number"
            step="any"
            min="0"
            required
            placeholder="148.20"
          />
        </label>
      </div>

      <label>
        Filled at
        <input
          name="filled_at"
          type="datetime-local"
          defaultValue={filledDefault}
          required
        />
      </label>

      <label>
        Thesis summary
        <textarea
          name="thesis_summary"
          rows={3}
          defaultValue={action.rationale ?? ""}
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

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Booking…" : "Confirm fill"}
      </button>
    </form>
  );
}
