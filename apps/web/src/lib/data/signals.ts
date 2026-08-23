import {
  INFLECTION_SCORER_KEY,
  inflectionSetupLabel,
  transitionCauseLabel,
  type InflectionSetup,
  type TransitionCause,
} from "@powerfund/domain";

import { resolveDb, type DbClient } from "@/lib/supabase/db";

export type ScorerTransition = {
  id: string;
  symbol: string;
  title: string;
  rationale: string;
  cause: TransitionCause | null;
  previousSetup: InflectionSetup | null;
  setup: InflectionSetup | null;
  firedAt: string;
  stale: boolean;
};

type SignalRow = {
  id: string;
  title: string;
  rationale: string;
  fired_at: string;
  payload: {
    cause?: string;
    previousSetup?: string;
    setup?: string;
    stale?: boolean;
  } | null;
  instruments: { symbol: string } | { symbol: string }[] | null;
};

function asSetup(value: string | undefined): InflectionSetup | null {
  if (value == null) return null;
  switch (value) {
    case "improving_research":
    case "improving_extended":
    case "correction_candidate":
    case "thesis_check":
    case "watch":
    case "falling_fundamentals":
    case "avoid_late":
    case "insufficient_data":
      return value;
    default:
      return null;
  }
}

function asCause(value: string | undefined): TransitionCause | null {
  switch (value) {
    case "new_quarter":
    case "price_move":
    case "crowding_change":
    case "data_completeness":
      return value;
    default:
      return null;
  }
}

export function setupChangeLabel(row: ScorerTransition): string {
  if (row.previousSetup && row.setup) {
    return `${inflectionSetupLabel(row.previousSetup)} → ${inflectionSetupLabel(row.setup)}`;
  }
  return row.title;
}

export async function listScorerTransitions(
  client?: DbClient,
): Promise<ScorerTransition[]> {
  const supabase = await resolveDb(client);
  const { data, error } = await supabase
    .from("signals")
    .select(
      "id, title, rationale, fired_at, payload, instruments(symbol)",
    )
    .eq("source", "scorer")
    .eq("scorer_key", INFLECTION_SCORER_KEY)
    .order("fired_at", { ascending: false })
    .limit(80);

  if (error) {
    throw new Error(`Failed to load scorer transitions: ${error.message}`);
  }

  return ((data as SignalRow[] | null) ?? []).map((row) => {
    const instrument = Array.isArray(row.instruments)
      ? row.instruments[0]
      : row.instruments;
    const payload = row.payload ?? {};
    return {
      id: row.id,
      symbol: instrument?.symbol ?? "—",
      title: row.title,
      rationale: row.rationale,
      cause: asCause(payload.cause),
      previousSetup: asSetup(payload.previousSetup),
      setup: asSetup(payload.setup),
      firedAt: row.fired_at,
      stale: payload.stale === true,
    };
  });
}

export { transitionCauseLabel };
