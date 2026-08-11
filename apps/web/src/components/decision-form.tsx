"use client";

import { useActionState } from "react";
import { DECISION_TYPES } from "@powerfund/domain";

import {
  saveDecision,
  type DecisionActionState,
} from "@/lib/actions/decisions";
import type { DecisionListItem } from "@/lib/data/decisions";
import type { InstrumentWithTheme } from "@/lib/data/research";

const initialState: DecisionActionState = { error: null };

type Props = {
  instruments: InstrumentWithTheme[];
  decision?: DecisionListItem | null;
  defaultInstrumentId?: string | null;
};

function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  }
  const date = new Date(iso);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function DecisionForm({
  instruments,
  decision = null,
  defaultInstrumentId = null,
}: Props) {
  const [state, formAction, pending] = useActionState(
    saveDecision,
    initialState,
  );

  return (
    <form className="research-form" action={formAction}>
      {decision ? <input type="hidden" name="id" value={decision.id} /> : null}

      <label>
        Instrument
        <select
          name="instrument_id"
          defaultValue={
            decision?.instrument_id ?? defaultInstrumentId ?? ""
          }
        >
          <option value="">No instrument</option>
          {instruments.map((instrument) => (
            <option key={instrument.id} value={instrument.id}>
              {instrument.symbol} — {instrument.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Decision type
        <select
          name="decision_type"
          defaultValue={decision?.decision_type ?? "watch"}
          required
        >
          {DECISION_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>

      <label>
        Action at
        <input
          type="datetime-local"
          name="action_at"
          defaultValue={toLocalInputValue(decision?.action_at)}
          required
        />
      </label>

      <label>
        Thesis
        <textarea
          name="thesis"
          required
          rows={5}
          defaultValue={decision?.thesis ?? ""}
        />
      </label>

      <label>
        Catalysts
        <textarea
          name="catalysts"
          rows={3}
          defaultValue={decision?.catalysts ?? ""}
        />
      </label>

      <label>
        Risks
        <textarea name="risks" rows={3} defaultValue={decision?.risks ?? ""} />
      </label>

      <label>
        Invalidation
        <textarea
          name="invalidation"
          rows={3}
          defaultValue={decision?.invalidation ?? ""}
        />
      </label>

      <label>
        Sizing rationale
        <textarea
          name="sizing_rationale"
          rows={3}
          defaultValue={decision?.sizing_rationale ?? ""}
        />
      </label>

      <label>
        Outcome notes
        <textarea
          name="outcome_notes"
          rows={3}
          defaultValue={decision?.outcome_notes ?? ""}
        />
      </label>

      <label>
        Outcome grade
        <input
          name="outcome_grade"
          placeholder="e.g. A / process-good / thesis-wrong"
          defaultValue={decision?.outcome_grade ?? ""}
        />
      </label>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : decision ? "Save decision" : "Log decision"}
      </button>
    </form>
  );
}
