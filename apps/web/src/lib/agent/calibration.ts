import {
  anchorKindForDecision,
  decisionClass,
  dueHorizonDays,
  type DecisionClass,
  type DecisionType,
} from "@powerfund/domain";

import { listDecisions } from "@/lib/data/decisions";
import { loadDecisionRelativeReturns } from "@/lib/data/decision-returns";
import { listDecisionOutcomes } from "@/lib/journal/record-outcome";
import { utcDay } from "@powerfund/domain";
import type { DbClient } from "@/lib/supabase/db";

export type CalibrationDue = {
  decision_id: string;
  symbol: string | null;
  decision_type: DecisionType;
  decision_class: DecisionClass;
  anchor_kind: "fill" | "decision";
  anchor_session: string | null;
  due_horizons: number[];
};

export type CalibrationUngradeable = {
  decision_id: string;
  symbol: string | null;
  decision_type: DecisionType;
  decision_class: DecisionClass;
  action_at: string;
  ungradeable_reason: string;
};

/**
 * What the calibration ritual is owed, what it has recorded, and what it can
 * never record.
 *
 * Built after the first live run, where reconciling fifteen grades meant reading
 * ids out of the database by hand. Three questions the journal cannot answer on
 * its own:
 *
 * - **What is still owed** — `horizon_due=true` answers this, but only for the
 *   page you asked for, and a run needs the whole set.
 * - **What was recorded** — the unique index stops one `(decision_id,
 *   horizon_days)` pair twice, so duplicates are not reportable and are not
 *   reported. It cannot stop a grade landing on the *wrong* decision, which is
 *   why the distinct-decision count is here: a batch of fifteen grades across
 *   fourteen decisions is the shape that mistake makes.
 * - **What can never be graded** — a fill-anchored decision with no fill has no
 *   anchor and so never appears in the worklist at all. Those rows are evidence
 *   about the journal, not absences: an intent-shaped enter shadowed by the one
 *   that actually filled, or an entry that never executed. Silently omitting
 *   them lets a completeness check understate the cohort.
 *
 * Derives everything from the same loader and the same `dueHorizonDays` the
 * journal uses. A second decision-return path here would be §7.7's "two
 * functions for one concept" with grades instead of dates, and the two would
 * disagree about what is owed.
 */
export async function getCalibrationStatus(supabase: DbClient) {
  const rows = await listDecisions(supabase);
  const asOf = utcDay(new Date().toISOString());

  const [relative, outcomes] = await Promise.all([
    loadDecisionRelativeReturns(supabase, rows, asOf),
    listDecisionOutcomes(
      supabase,
      rows.map((row) => row.id),
    ),
  ]);

  const due: CalibrationDue[] = [];
  const ungradeable: CalibrationUngradeable[] = [];

  for (const row of rows) {
    const report = relative.get(row.id);
    if (report == null) continue;

    if (report.anchor == null) {
      // Only a fill-anchored decision can fail to find an anchor. A hold or a
      // watch anchors on action_at, which every decision has.
      if (anchorKindForDecision(row.decision_type) === "fill") {
        ungradeable.push({
          decision_id: row.id,
          symbol: row.symbol,
          decision_type: row.decision_type,
          decision_class: decisionClass(row.decision_type),
          action_at: row.action_at,
          ungradeable_reason: report.reason ?? "no_anchor",
        });
      }
      continue;
    }

    const horizons = dueHorizonDays({
      horizons: report.horizons,
      gradedHorizons: (outcomes.get(row.id) ?? []).map(
        (outcome) => outcome.horizon_days,
      ),
    });
    if (horizons.length === 0) continue;

    due.push({
      decision_id: row.id,
      symbol: row.symbol,
      decision_type: row.decision_type,
      decision_class: report.decisionClass,
      anchor_kind: report.anchor.kind,
      anchor_session: report.anchor.session,
      due_horizons: horizons,
    });
  }

  const recorded = [...outcomes.values()].flat();
  const byHorizon: Record<string, number> = {};
  for (const row of recorded) {
    const key = row.horizon_days == null ? "off_clock" : String(row.horizon_days);
    byHorizon[key] = (byHorizon[key] ?? 0) + 1;
  }

  const dueByClass: Record<string, number> = {};
  for (const row of due) {
    dueByClass[row.decision_class] = (dueByClass[row.decision_class] ?? 0) + 1;
  }

  return {
    as_of: new Date().toISOString(),
    due_count: due.length,
    due_by_class: dueByClass,
    due,
    graded: {
      total: recorded.length,
      // Not a duplicate check — the unique index makes clocked duplicates
      // impossible. This is here because a grade written against the wrong
      // decision is a perfectly valid row, and a count below the batch size is
      // how that shows up.
      distinct_decisions: new Set(recorded.map((row) => row.decision_id)).size,
      by_horizon: byHorizon,
    },
    ungradeable_count: ungradeable.length,
    ungradeable,
    notes: [
      "due is the whole worklist, not a page. Grade each decision_id at each horizon in due_horizons, passing horizon_days on recordDecisionOutcome.",
      "Re-read this after a batch: every decision you graded should have left due, and graded.distinct_decisions should equal the number of decisions you intended to grade.",
      "ungradeable rows are fill-anchored decisions with no linked fill. They never enter the worklist and are not failures to grade — report the count in the quarterly completeness check rather than omitting them.",
    ],
  };
}
