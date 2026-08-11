"use client";

import { useActionState } from "react";
import { DOSSIER_STATUSES } from "@powerfund/domain";

import {
  saveDossier,
  type DossierActionState,
} from "@/lib/actions/dossiers";
import type { DossierRow } from "@/lib/data/research";

const initialState: DossierActionState = { error: null };

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
        <input name="source" defaultValue={dossier?.source ?? ""} />
      </label>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : dossier ? "Save dossier" : "Create dossier"}
      </button>
    </form>
  );
}
