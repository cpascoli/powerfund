import { RISK_DEFAULTS, utcDay } from "@powerfund/domain";

import { resolveDb, type DbClient } from "@/lib/supabase/db";

/** Re-open Due if the sleeve is still underwater this many UTC days after the last covering diagnostic. */
export const DRAWDOWN_DIAGNOSTIC_RECHECK_DAYS = 14;
/** Re-open Due when live drawdown is at least this many percentage points worse than the diagnosed print. */
export const DRAWDOWN_DIAGNOSTIC_WORSEN_PP = 5;

export type SleeveDiagnosticRecord = {
  id: string;
  at: string;
  text: string;
  deployedDrawdownPct: number | null;
};

export type DrawdownDiagnosticState =
  | { status: "clear" }
  | {
      status: "due";
      reason: "never" | "new_episode" | "worsened" | "stale";
      currentPct: number;
      covering: SleeveDiagnosticRecord | null;
    }
  | {
      status: "monitoring";
      currentPct: number;
      covering: SleeveDiagnosticRecord;
    };

export function looksLikeSleeveDiagnostic(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("deployed-drawdown") ||
    t.includes("deployed drawdown") ||
    t.includes("deployed-sleeve drawdown") ||
    t.includes("sleeve diagnostic") ||
    ((t.includes("kill-switch") || t.includes("kill switch")) &&
      t.includes("diagnostic"))
  );
}

export function parseDiagnosedDrawdownPct(text: string): number | null {
  const matches = [
    ...text.matchAll(
      /(?:unitized\s+)?deployed(?:-sleeve)?(?:\s+sleeve)?\s+drawdown[^\d%]{0,48}~?\s*(\d+(?:\.\d+)?)\s*%/gi,
    ),
  ];
  const last = matches.at(-1)?.[1];
  if (last == null) return null;
  const value = Number(last);
  return Number.isFinite(value) ? value : null;
}

export function sleeveDiagnosticsFromReviews(
  reviews: Array<{
    id: string;
    title: string;
    instructions?: string | null;
    outcome?: string | null;
    completed_at: string | null;
    scope: string;
    status: string;
  }>,
): SleeveDiagnosticRecord[] {
  const records: SleeveDiagnosticRecord[] = [];
  for (const review of reviews) {
    if (review.status !== "completed" || review.scope !== "portfolio") continue;
    if (review.completed_at == null) continue;
    const text = [review.title, review.instructions, review.outcome]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join("\n");
    if (!looksLikeSleeveDiagnostic(text)) continue;
    records.push({
      id: review.id,
      at: review.completed_at,
      text,
      deployedDrawdownPct: parseDiagnosedDrawdownPct(text),
    });
  }
  return records;
}

export async function listSleeveDiagnosticRecords(
  client?: DbClient,
): Promise<SleeveDiagnosticRecord[]> {
  const supabase = await resolveDb(client);
  const { data, error } = await supabase
    .from("review_tasks")
    .select("id, title, instructions, outcome, completed_at, scope, status")
    .eq("status", "completed")
    .eq("scope", "portfolio");
  if (error) {
    throw new Error(`Failed to load sleeve diagnostics: ${error.message}`);
  }
  return sleeveDiagnosticsFromReviews(
    (data as Array<{
      id: string;
      title: string;
      instructions: string | null;
      outcome: string | null;
      completed_at: string | null;
      scope: string;
      status: string;
    }> | null) ?? [],
  );
}

export function currentBreachStartedOn(
  daily: Array<{ date: string; pct: number | null }>,
  threshold: number,
): string | null {
  const last = daily.at(-1);
  if (last == null || last.pct == null || last.pct < threshold) return null;
  let started = last.date;
  for (let i = daily.length - 1; i >= 0; i--) {
    const point = daily[i];
    if (point == null || point.pct == null || point.pct < threshold) break;
    started = point.date;
  }
  return started;
}

function utcDaysSince(iso: string, now: Date): number {
  const then = Date.parse(`${utcDay(iso)}T00:00:00Z`);
  const today = Date.parse(`${utcDay(now.toISOString())}T00:00:00Z`);
  return Math.round((today - then) / 86_400_000);
}

function latestCovering(
  records: SleeveDiagnosticRecord[],
  episodeStart: string | null,
): SleeveDiagnosticRecord | null {
  const eligible = records.filter(
    (row) => episodeStart == null || utcDay(row.at) >= episodeStart,
  );
  eligible.sort((left, right) => left.at.localeCompare(right.at));
  return eligible.at(-1) ?? null;
}

export function resolveDrawdownDiagnostic(args: {
  breached: boolean;
  currentPct: number | null;
  daily: Array<{ date: string; pct: number | null }>;
  records: SleeveDiagnosticRecord[];
  now?: Date;
  threshold?: number;
  recheckDays?: number;
  worsenPp?: number;
}): DrawdownDiagnosticState {
  const currentPct = args.currentPct;
  if (!args.breached || currentPct == null) return { status: "clear" };

  const threshold = args.threshold ?? RISK_DEFAULTS.drawdownKillSwitchPct;
  const recheckDays = args.recheckDays ?? DRAWDOWN_DIAGNOSTIC_RECHECK_DAYS;
  const worsenPp = args.worsenPp ?? DRAWDOWN_DIAGNOSTIC_WORSEN_PP;
  const now = args.now ?? new Date();
  const episodeStart = currentBreachStartedOn(args.daily, threshold);
  const covering = latestCovering(args.records, episodeStart);

  if (covering == null) {
    return {
      status: "due",
      reason: args.records.length > 0 ? "new_episode" : "never",
      currentPct,
      covering: null,
    };
  }

  const diagnosedPct = covering.deployedDrawdownPct ?? threshold;
  if (currentPct >= diagnosedPct + worsenPp) {
    return { status: "due", reason: "worsened", currentPct, covering };
  }
  if (utcDaysSince(covering.at, now) >= recheckDays) {
    return { status: "due", reason: "stale", currentPct, covering };
  }
  return { status: "monitoring", currentPct, covering };
}
