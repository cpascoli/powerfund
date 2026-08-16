"use client";

import { useActionState } from "react";
import {
  DOSSIER_RESEARCH_LEVELS,
  DOSSIER_STATUSES,
  dossierResearchLevelLabel,
} from "@powerfund/domain";

import {
  saveDossier,
  type DossierActionState,
} from "@/lib/actions/dossiers";
import type { DossierRow } from "@/lib/data/research";

const initialState: DossierActionState = { error: null };

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

type Props = {
  instrumentId: string;
  symbol: string;
  dossier: DossierRow | null;
};

export function DossierForm({ instrumentId, symbol, dossier }: Props) {
  const [state, formAction, pending] = useActionState(saveDossier, initialState);

  return (
    <form className="research-form" action={formAction}>
      <input type="hidden" name="instrument_id" value={instrumentId} />
      <input type="hidden" name="symbol" value={symbol} />

      <label>
        Status
        <select name="status" defaultValue={dossier?.status ?? "investigate"}>
          {DOSSIER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>

      <label>
        Research level
        <select
          name="research_level"
          defaultValue={dossier?.research_level ?? "draft"}
        >
          {DOSSIER_RESEARCH_LEVELS.map((level) => (
            <option key={level} value={level}>
              {dossierResearchLevelLabel(level)}
            </option>
          ))}
        </select>
      </label>

      <label>
        Valuation as of
        <input
          type="date"
          name="as_of_at"
          defaultValue={toDateInput(dossier?.as_of_at)}
        />
      </label>

      <label>
        Verified on
        <input
          type="date"
          name="verified_at"
          defaultValue={toDateInput(dossier?.verified_at)}
        />
      </label>

      <label>
        Next review
        <input
          type="date"
          name="next_review_at"
          defaultValue={toDateInput(dossier?.next_review_at)}
        />
      </label>

      <label>
        Summary
        <textarea
          name="summary"
          required
          rows={4}
          defaultValue={dossier?.summary ?? ""}
        />
      </label>

      <label>
        Thesis
        <textarea name="thesis" rows={5} defaultValue={dossier?.thesis ?? ""} />
      </label>

      <label>
        Catalysts
        <textarea
          name="catalysts"
          rows={3}
          defaultValue={dossier?.catalysts ?? ""}
        />
      </label>

      <label>
        Risks
        <textarea name="risks" rows={4} defaultValue={dossier?.risks ?? ""} />
      </label>

      <label>
        Invalidation
        <textarea
          name="invalidation"
          rows={3}
          defaultValue={dossier?.invalidation ?? ""}
        />
      </label>

      <label>
        Competitive notes
        <textarea
          name="competitive_notes"
          rows={4}
          defaultValue={dossier?.competitive_notes ?? ""}
        />
      </label>

      <label>
        Next diligence
        <textarea
          name="next_diligence"
          rows={3}
          defaultValue={dossier?.next_diligence ?? ""}
        />
      </label>

      <label>
        Source
        <textarea
          name="source"
          rows={6}
          defaultValue={dossier?.source ?? ""}
        />
      </label>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : dossier ? "Save dossier" : "Create dossier"}
      </button>
    </form>
  );
}
