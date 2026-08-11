import { createClient } from "@/lib/supabase/server";

import { listInstrumentsWithThemes } from "@/lib/data/research";

export type DecisionRow = {
  id: string;
  instrument_id: string | null;
  decision_type:
    | "enter"
    | "add"
    | "reduce"
    | "exit"
    | "hold"
    | "watch";
  thesis: string;
  catalysts: string | null;
  risks: string | null;
  invalidation: string | null;
  sizing_rationale: string | null;
  action_at: string;
  outcome_notes: string | null;
  outcome_grade: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type DecisionListItem = DecisionRow & {
  symbol: string | null;
  instrument_name: string | null;
};

export async function listDecisions(): Promise<DecisionListItem[]> {
  const supabase = await createClient();
  const [{ data, error }, instruments] = await Promise.all([
    supabase
      .from("decisions")
      .select(
        "id, instrument_id, decision_type, thesis, catalysts, risks, invalidation, sizing_rationale, action_at, outcome_notes, outcome_grade, reviewed_at, created_at",
      )
      .order("action_at", { ascending: false }),
    listInstrumentsWithThemes(),
  ]);

  if (error) {
    throw new Error(`Failed to load decisions: ${error.message}`);
  }

  const byId = new Map(instruments.map((row) => [row.id, row]));

  return ((data as DecisionRow[] | null) ?? []).map((decision) => {
    const instrument = decision.instrument_id
      ? byId.get(decision.instrument_id)
      : undefined;
    return {
      ...decision,
      symbol: instrument?.symbol ?? null,
      instrument_name: instrument?.name ?? null,
    };
  });
}

export async function getDecision(
  id: string,
): Promise<DecisionListItem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("decisions")
    .select(
      "id, instrument_id, decision_type, thesis, catalysts, risks, invalidation, sizing_rationale, action_at, outcome_notes, outcome_grade, reviewed_at, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load decision: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  const decision = data as DecisionRow;
  if (!decision.instrument_id) {
    return {
      ...decision,
      symbol: null,
      instrument_name: null,
    };
  }

  const instruments = await listInstrumentsWithThemes();
  const instrument = instruments.find((row) => row.id === decision.instrument_id);

  return {
    ...decision,
    symbol: instrument?.symbol ?? null,
    instrument_name: instrument?.name ?? null,
  };
}
