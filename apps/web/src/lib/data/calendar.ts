import { OPEN_REVIEW_TASK_STATUSES } from "@powerfund/domain";

import {
  daysUntil,
  formatAgendaDay,
  reviewTaskSubjectLinks,
  startOfUtcDay,
  upcomingClockTime,
  type UpcomingAgendaRow,
  type UpcomingDayGroup,
} from "@/lib/data/briefing";
import {
  hydrateReviewTasks,
  listReviewTaskRows,
  type ReviewTaskRecord,
} from "@/lib/reviews/records";
import { resolveDb, type DbClient } from "@/lib/supabase/db";

export const CALENDAR_HORIZON_FILTERS = [
  "this_week",
  "this_month",
  "next_month",
  "later",
] as const;
export type CalendarHorizonFilter = (typeof CALENDAR_HORIZON_FILTERS)[number];

export const CALENDAR_STALE_AFTER_DAYS = 7;

export type PublicCalendarKind = "scheduled" | "event_window";

export type PublicCalendarEvent = {
  id: string;
  title: string;
  at: string;
  kind: PublicCalendarKind;
  scope: "company" | "theme" | "macro";
  symbols: string[];
  themes: Array<{ slug: string; name: string }>;
  window: { not_before: string; due_by: string } | null;
};

type CatalystTask = Pick<
  ReviewTaskRecord,
  | "id"
  | "title"
  | "scope"
  | "status"
  | "trigger"
  | "symbols"
  | "themes"
  | "scheduled_for"
  | "not_before"
  | "due_by"
>;

export function isPublicCatalyst(task: CatalystTask): boolean {
  switch (task.scope) {
    case "portfolio":
      return false;
    case "company":
    case "theme":
    case "macro":
      break;
    default: {
      const _exhaustive: never = task.scope;
      return _exhaustive;
    }
  }

  switch (task.trigger.type) {
    case "scheduled":
    case "event_window":
      return true;
    case "condition":
      return false;
    default: {
      const _exhaustive: never = task.trigger;
      return _exhaustive;
    }
  }
}

export function toPublicCalendarEvent(
  task: CatalystTask,
): PublicCalendarEvent | null {
  if (!isPublicCatalyst(task) || task.scope === "portfolio") return null;

  const base = {
    id: task.id,
    title: task.title,
    scope: task.scope,
    symbols: [...task.symbols],
    themes: task.themes.map((theme) => ({
      slug: theme.slug,
      name: theme.name,
    })),
  };

  switch (task.trigger.type) {
    case "scheduled": {
      const at = task.scheduled_for ?? task.trigger.at;
      return { ...base, at, kind: "scheduled", window: null };
    }
    case "event_window": {
      const not_before = task.not_before ?? task.trigger.not_before;
      const due_by = task.due_by ?? task.trigger.due_by;
      return {
        ...base,
        at: not_before,
        kind: "event_window",
        window: { not_before, due_by },
      };
    }
    case "condition":
      return null;
    default: {
      const _exhaustive: never = task.trigger;
      return _exhaustive;
    }
  }
}

export function calendarKindLabel(kind: PublicCalendarKind): string {
  switch (kind) {
    case "scheduled":
      return "Event";
    case "event_window":
      return "Window";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function parseCalendarHorizonFilter(
  value: string | undefined,
): CalendarHorizonFilter {
  if (value && (CALENDAR_HORIZON_FILTERS as readonly string[]).includes(value)) {
    return value as CalendarHorizonFilter;
  }
  return "this_month";
}

function eventYearMonth(event: PublicCalendarEvent): number | null {
  const date = event.at.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match || match[1] == null || match[2] == null) return null;
  return Number(match[1]) * 12 + (Number(match[2]) - 1);
}

function utcYearMonth(date: Date): number {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

export function isFreshCatalyst(
  event: PublicCalendarEvent,
  now = new Date(),
): boolean {
  const today = startOfUtcDay(now);
  return daysUntil(event.at.slice(0, 10), today) >= -CALENDAR_STALE_AFTER_DAYS;
}

export function matchesCalendarHorizon(
  event: PublicCalendarEvent,
  horizon: CalendarHorizonFilter,
  now = new Date(),
): boolean {
  const today = startOfUtcDay(now);
  const date = event.at.slice(0, 10);
  const days = daysUntil(date, today);
  const itemMonth = eventYearMonth(event);
  const todayMonth = utcYearMonth(today);
  switch (horizon) {
    case "this_week":
      return days >= -CALENDAR_STALE_AFTER_DAYS && days <= 7;
    case "this_month":
      return itemMonth === todayMonth;
    case "next_month":
      return itemMonth === todayMonth + 1;
    case "later":
      return itemMonth != null && itemMonth > todayMonth + 1;
    default: {
      const _exhaustive: never = horizon;
      return _exhaustive;
    }
  }
}

export function filterCalendarEvents(
  events: PublicCalendarEvent[],
  horizon: CalendarHorizonFilter,
  now = new Date(),
): PublicCalendarEvent[] {
  return events.filter(
    (event) =>
      isFreshCatalyst(event, now) &&
      matchesCalendarHorizon(event, horizon, now),
  );
}

function eventHref(event: PublicCalendarEvent): string | null {
  if (event.symbols.length === 1) {
    return `/explore/${event.symbols[0]}`;
  }
  if (event.symbols.length === 0 && event.themes.length === 1) {
    return `/explore?theme=${event.themes[0]!.slug}`;
  }
  return null;
}

export function toCalendarAgendaRow(
  event: PublicCalendarEvent,
): UpcomingAgendaRow {
  return {
    key: `catalyst-${event.id}`,
    kind: "review",
    kindLabel: calendarKindLabel(event.kind),
    time: upcomingClockTime(event.at),
    href: eventHref(event),
    title: event.title,
    detail: "",
    subjects: reviewTaskSubjectLinks({
      id: event.id,
      title: event.title,
      instructions: null,
      status: "pending",
      scheduled_for: event.at,
      not_before: event.window?.not_before ?? null,
      due_by: event.window?.due_by ?? null,
      symbols: event.symbols,
      themes: event.themes,
    }),
    instructions: null,
  };
}

export function calendarDayGroups(
  events: PublicCalendarEvent[],
  now = new Date(),
): UpcomingDayGroup[] {
  const today = startOfUtcDay(now);
  const groups: UpcomingDayGroup[] = [];
  for (const event of events) {
    const date = event.at.slice(0, 10);
    const row = toCalendarAgendaRow(event);
    const last = groups[groups.length - 1];
    if (last && last.date === date) {
      last.rows.push(row);
      continue;
    }
    const formatted = formatAgendaDay(date, today);
    groups.push({
      date,
      ...formatted,
      rows: [row],
    });
  }
  return groups;
}

function sortEvents(
  left: PublicCalendarEvent,
  right: PublicCalendarEvent,
): number {
  const when = left.at.localeCompare(right.at);
  if (when !== 0) return when;
  return left.title.localeCompare(right.title);
}

/**
 * Dated public catalysts only. Does not evaluate triggers (no writes) and
 * never includes planned trades, price conditions, or operator instructions.
 */
export async function listPublicCalendarEvents(
  client?: DbClient,
): Promise<PublicCalendarEvent[]> {
  const supabase = await resolveDb(client);
  const rows = await listReviewTaskRows(supabase, [
    ...OPEN_REVIEW_TASK_STATUSES,
  ]);
  const tasks = await hydrateReviewTasks(supabase, rows);
  return tasks
    .map((task) => toPublicCalendarEvent(task))
    .filter((event): event is PublicCalendarEvent => event != null)
    .filter((event) => isFreshCatalyst(event))
    .sort(sortEvents);
}

export function calendarMarkdown(events: PublicCalendarEvent[]): string {
  const lines = [
    "# Catalyst calendar",
    "",
    "Dated events Power Fund monitors. Earnings, policy windows, and known catalysts. Not a trade list.",
    "",
    "| Date | UTC | Event | Names | Type |",
    "| --- | --- | --- | --- | --- |",
    ...events.map((event) => {
      const date = event.at.slice(0, 10);
      const time = upcomingClockTime(event.at) ?? "—";
      const names = [
        ...event.themes.map((theme) => theme.name),
        ...event.symbols,
      ].join(", ");
      return `| ${date} | ${time} | ${event.title} | ${names || "—"} | ${calendarKindLabel(event.kind)} |`;
    }),
    "",
  ];
  return lines.join("\n");
}
