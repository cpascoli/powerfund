import {
  daysUntil,
  formatAgendaDay,
  startOfUtcDay,
} from "@/lib/data/briefing";
import type { DecisionListItem } from "@/lib/data/decisions";

export const JOURNAL_HORIZONS = [
  "this_week",
  "this_month",
  "last_month",
  "all",
] as const;

export type JournalHorizon = (typeof JOURNAL_HORIZONS)[number];

export const JOURNAL_HORIZON_ITEMS: Array<{
  id: JournalHorizon;
  label: string;
}> = [
  { id: "this_week", label: "This week" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "all", label: "All" },
];

export function parseJournalHorizon(
  value: string | undefined,
): JournalHorizon {
  if (value && (JOURNAL_HORIZONS as readonly string[]).includes(value)) {
    return value as JournalHorizon;
  }
  return "this_week";
}

export function utcDayOf(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export function utcTimeOf(iso: string): string {
  return new Date(iso).toISOString().slice(11, 16);
}

function utcYearMonth(date: Date): number {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

/** Monday 00:00 UTC of the week containing `now`. */
export function startOfUtcWeek(now = new Date()): Date {
  const day = startOfUtcDay(now);
  const weekday = day.getUTCDay();
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
  day.setUTCDate(day.getUTCDate() - daysFromMonday);
  return day;
}

export function matchesJournalHorizon(
  actionAt: string,
  horizon: JournalHorizon,
  now = new Date(),
): boolean {
  const today = startOfUtcDay(now);
  const actionDay = startOfUtcDay(new Date(actionAt));
  const actionMonth = utcYearMonth(actionDay);
  const todayMonth = utcYearMonth(today);
  switch (horizon) {
    case "this_week":
      return actionDay.getTime() >= startOfUtcWeek(now).getTime() &&
        actionDay.getTime() <= today.getTime();
    case "this_month":
      return actionMonth === todayMonth;
    case "last_month":
      return actionMonth === todayMonth - 1;
    case "all":
      return true;
    default: {
      const _exhaustive: never = horizon;
      return _exhaustive;
    }
  }
}

export function filterJournalEntries(
  rows: DecisionListItem[],
  horizon: JournalHorizon,
  symbol: string,
  now = new Date(),
): DecisionListItem[] {
  const wanted = symbol.trim().toUpperCase();
  return rows.filter((row) => {
    if (wanted.length > 0 && row.symbol !== wanted) return false;
    return matchesJournalHorizon(row.action_at, horizon, now);
  });
}

export type JournalAgendaRow = {
  id: string;
  time: string;
  href: string;
  title: string;
  thesis: string;
  decisionType: DecisionListItem["decision_type"];
};

export type JournalDayGroup = {
  date: string;
  weekday: string;
  dayMonth: string;
  monthLabel: string;
  isToday: boolean;
  isYesterday: boolean;
  rows: JournalAgendaRow[];
};

export function journalDayGroups(
  rows: DecisionListItem[],
  now = new Date(),
): JournalDayGroup[] {
  const today = startOfUtcDay(now);
  const groups: JournalDayGroup[] = [];
  for (const row of rows) {
    const date = utcDayOf(row.action_at);
    const last = groups[groups.length - 1];
    const item: JournalAgendaRow = {
      id: row.id,
      time: utcTimeOf(row.action_at),
      href: `/decisions/${row.id}`,
      title: row.symbol ?? row.decision_type,
      thesis: row.thesis,
      decisionType: row.decision_type,
    };
    if (last && last.date === date) {
      last.rows.push(item);
      continue;
    }
    const formatted = formatAgendaDay(date, today);
    groups.push({
      date,
      weekday: formatted.weekday,
      dayMonth: formatted.dayMonth,
      monthLabel: formatted.monthLabel,
      isToday: formatted.isToday,
      isYesterday: daysUntil(date, today) === -1,
      rows: [item],
    });
  }
  return groups;
}

export function journalEmptyCopy(
  horizon: JournalHorizon,
  symbol: string,
): string {
  const name = symbol.trim().toUpperCase();
  const forCompany = name.length > 0 ? ` for ${name}` : "";
  switch (horizon) {
    case "this_week":
      return `No journal entries${forCompany} this week.`;
    case "this_month":
      return `No journal entries${forCompany} this month.`;
    case "last_month":
      return `No journal entries${forCompany} last month.`;
    case "all":
      return name.length > 0
        ? `No journal entries for ${name}.`
        : "No decisions recorded yet. Log a watch/investigate/enter before or at the time of any material action.";
    default: {
      const _exhaustive: never = horizon;
      return _exhaustive;
    }
  }
}

export function replaceJournalSearch(args: {
  horizon: JournalHorizon;
  symbol: string;
}): void {
  const params = new URLSearchParams();
  if (args.horizon !== "this_week") params.set("when", args.horizon);
  if (args.symbol.trim().length > 0) {
    params.set("symbol", args.symbol.trim().toUpperCase());
  }
  const qs = params.toString();
  window.history.replaceState(
    window.history.state,
    "",
    qs.length > 0 ? `/decisions?${qs}` : "/decisions",
  );
}
