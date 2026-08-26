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

export const CALENDAR_VIEWS = ["upcoming", "past"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export const CALENDAR_PAST_SCOPES = ["public", "operator"] as const;
export type CalendarPastScope = (typeof CALENDAR_PAST_SCOPES)[number];

export const CALENDAR_STALE_AFTER_DAYS = 7;

export type PublicCalendarKind = "scheduled" | "event_window";
export type CalendarPastKind = PublicCalendarKind | "condition";

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

export type CalendarPastEvent = {
  id: string;
  title: string;
  at: string;
  completed_at: string;
  kind: CalendarPastKind;
  scope: ReviewTaskRecord["scope"];
  symbols: string[];
  themes: Array<{ slug: string; name: string }>;
  window: { not_before: string; due_by: string } | null;
  outcome: string | null;
  is_public: boolean;
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
  | "completed_at"
  | "outcome"
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

export function calendarPastKindLabel(event: CalendarPastEvent): string {
  switch (event.kind) {
    case "condition":
      return "Condition";
    case "event_window":
      return "Window";
    case "scheduled":
      return event.scope === "portfolio" ? "Book" : "Event";
    default: {
      const _exhaustive: never = event.kind;
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

export function parseCalendarView(value: string | undefined): CalendarView {
  if (value && (CALENDAR_VIEWS as readonly string[]).includes(value)) {
    return value as CalendarView;
  }
  return "upcoming";
}

export function parseCalendarPastScope(
  value: string | undefined,
  signedIn: boolean,
): CalendarPastScope {
  if (
    signedIn &&
    value &&
    (CALENDAR_PAST_SCOPES as readonly string[]).includes(value)
  ) {
    return value as CalendarPastScope;
  }
  return "public";
}

function catalystEventAt(task: CatalystTask): string | null {
  switch (task.trigger.type) {
    case "scheduled":
      return task.scheduled_for ?? task.trigger.at;
    case "event_window":
      return task.not_before ?? task.trigger.not_before;
    case "condition":
      return task.completed_at;
    default: {
      const _exhaustive: never = task.trigger;
      return _exhaustive;
    }
  }
}

export function toPastCalendarEvent(
  task: CatalystTask,
  includeOperator = false,
): CalendarPastEvent | null {
  if (task.status !== "completed" || task.completed_at == null) return null;
  const isPublic = isPublicCatalyst(task);
  if (includeOperator ? isPublic : !isPublic) return null;

  const at = catalystEventAt(task);
  if (at == null) return null;

  const base = {
    id: task.id,
    title: task.title,
    at,
    completed_at: task.completed_at,
    scope: task.scope,
    symbols: [...task.symbols],
    themes: task.themes.map((theme) => ({
      slug: theme.slug,
      name: theme.name,
    })),
    outcome: task.outcome,
    is_public: isPublic,
  };

  switch (task.trigger.type) {
    case "scheduled":
      return { ...base, kind: "scheduled" as const, window: null };
    case "event_window": {
      const not_before = task.not_before ?? task.trigger.not_before;
      const due_by = task.due_by ?? task.trigger.due_by;
      return {
        ...base,
        kind: "event_window" as const,
        window: { not_before, due_by },
      };
    }
    case "condition":
      return { ...base, kind: "condition" as const, window: null };
    default: {
      const _exhaustive: never = task.trigger;
      return _exhaustive;
    }
  }
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

function pastEventHref(event: CalendarPastEvent): string | null {
  return eventHref({
    symbols: event.symbols,
    themes: event.themes,
  });
}

function eventHref(event: {
  symbols: string[];
  themes: Array<{ slug: string }>;
}): string | null {
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

export function toCalendarPastAgendaRow(
  event: CalendarPastEvent,
): UpcomingAgendaRow {
  return {
    key: `catalyst-past-${event.id}`,
    kind: "review",
    kindLabel: calendarPastKindLabel(event),
    time: upcomingClockTime(event.completed_at),
    href: pastEventHref(event),
    title: event.title,
    detail: "",
    subjects: reviewTaskSubjectLinks({
      id: event.id,
      title: event.title,
      instructions: null,
      status: "completed",
      scheduled_for: event.at,
      not_before: event.window?.not_before ?? null,
      due_by: event.window?.due_by ?? null,
      symbols: event.symbols,
      themes: event.themes,
    }),
    instructions: event.outcome,
  };
}

export function calendarPastDayGroups(
  events: CalendarPastEvent[],
  now = new Date(),
): UpcomingDayGroup[] {
  const today = startOfUtcDay(now);
  const groups: UpcomingDayGroup[] = [];
  for (const event of events) {
    const date = event.completed_at.slice(0, 10);
    const row = toCalendarPastAgendaRow(event);
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

function sortPastEvents(
  left: CalendarPastEvent,
  right: CalendarPastEvent,
): number {
  const when = right.completed_at.localeCompare(left.completed_at);
  if (when !== 0) return when;
  return left.title.localeCompare(right.title);
}

/**
 * Completed public catalysts, with outcomes. Pass `operator: true` for
 * portfolio and price-condition reviews only (not the public set).
 */
export async function listCompletedCalendarEvents(
  client?: DbClient,
  options: { operator?: boolean } = {},
): Promise<CalendarPastEvent[]> {
  const supabase = await resolveDb(client);
  const rows = await listReviewTaskRows(supabase, ["completed"]);
  const tasks = await hydrateReviewTasks(supabase, rows);
  const includeOperator = options.operator === true;
  return tasks
    .map((task) => toPastCalendarEvent(task, includeOperator))
    .filter((event): event is CalendarPastEvent => event != null)
    .sort(sortPastEvents);
}

export async function listCompletedPublicReviewsForSymbol(
  symbol: string,
  client?: DbClient,
): Promise<CalendarPastEvent[]> {
  const needle = symbol.trim().toUpperCase();
  if (!needle) return [];
  const events = await listCompletedCalendarEvents(client, { operator: false });
  return events.filter((event) => event.symbols.includes(needle)).slice(0, 8);
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

export function calendarPastMarkdown(events: CalendarPastEvent[]): string {
  const lines = [
    "# Completed catalysts",
    "",
    "Public events that have been reviewed. Outcomes only — no operator instructions.",
    "",
    "| Completed | Event | Names | Outcome | Type |",
    "| --- | --- | --- | --- | --- |",
    ...events.map((event) => {
      const date = event.completed_at.slice(0, 10);
      const names = [
        ...event.themes.map((theme) => theme.name),
        ...event.symbols,
      ].join(", ");
      const outcome = (event.outcome ?? "").replace(/\s+/g, " ").trim() || "—";
      return `| ${date} | ${event.title} | ${names || "—"} | ${outcome} | ${calendarPastKindLabel(event)} |`;
    }),
    "",
  ];
  return lines.join("\n");
}
