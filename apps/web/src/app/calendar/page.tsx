import type { ReactNode } from "react";
import Link from "next/link";

import {
  calendarDayGroups,
  calendarPastDayGroups,
  filterCalendarEvents,
  listCompletedCalendarEvents,
  listPublicCalendarEvents,
  parseCalendarHorizonFilter,
  parseCalendarPastScope,
  parseCalendarView,
  type CalendarHorizonFilter,
  type CalendarPastScope,
  type CalendarView,
  type PublicCalendarEvent,
} from "@/lib/data/calendar";
import type {
  ReviewSubjectLink,
  UpcomingAgendaRow,
  UpcomingDayGroup,
} from "@/lib/data/briefing";
import { getSessionUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Calendar",
  description:
    "Dated catalysts Power Fund monitors — earnings, policy windows, and known events.",
};

const VIEW_FILTERS: Array<{ id: CalendarView; label: string }> = [
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "Past" },
];

const HORIZON_FILTERS: Array<{ id: CalendarHorizonFilter; label: string }> = [
  { id: "this_week", label: "This week" },
  { id: "this_month", label: "This month" },
  { id: "next_month", label: "Next month" },
  { id: "later", label: "Later" },
];

const PAST_SCOPE_FILTERS: Array<{ id: CalendarPastScope; label: string }> = [
  { id: "public", label: "Public catalysts" },
  { id: "operator", label: "Operator" },
];

function calendarHref(args: {
  view: CalendarView;
  when?: CalendarHorizonFilter;
  scope?: CalendarPastScope;
}): string {
  const params = new URLSearchParams();
  params.set("view", args.view);
  if (args.view === "past") {
    if (args.scope === "operator") params.set("scope", "operator");
  } else if (args.when && args.when !== "this_month") {
    params.set("when", args.when);
  }
  const query = params.toString();
  return `/calendar?${query}`;
}

function weekdayCaption(day: UpcomingDayGroup): string {
  if (day.isToday) return "Today";
  if (day.isTomorrow) return "Tomorrow";
  return day.weekday;
}

function emptyCopy(
  view: CalendarView,
  horizon: CalendarHorizonFilter,
  scope: CalendarPastScope,
): string {
  if (view === "past") {
    return scope === "operator"
      ? "No completed operator reviews."
      : "No completed catalysts yet.";
  }
  switch (horizon) {
    case "this_week":
      return "No dated catalysts this week.";
    case "this_month":
      return "No dated catalysts this month.";
    case "next_month":
      return "No dated catalysts next month.";
    case "later":
      return "No dated catalysts further out.";
    default: {
      const _exhaustive: never = horizon;
      return _exhaustive;
    }
  }
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ when?: string; view?: string; scope?: string }>;
}) {
  const { when: whenRaw, view: viewRaw, scope: scopeRaw } = await searchParams;
  const signedIn = (await getSessionUser()) != null;
  const view = viewRaw
    ? parseCalendarView(viewRaw)
    : signedIn
      ? "past"
      : "upcoming";
  const horizon = parseCalendarHorizonFilter(whenRaw);
  const scope = parseCalendarPastScope(scopeRaw, signedIn);

  const upcoming =
    view === "upcoming"
      ? filterCalendarEvents(await listPublicCalendarEvents(), horizon)
      : [];
  const past =
    view === "past"
      ? await listCompletedCalendarEvents(undefined, {
          operator: scope === "operator",
        })
      : [];
  const rows = view === "past" ? past : upcoming;
  const showMonths = view === "past" || horizon !== "this_week";

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Calendar</h1>
          <p>
            {view === "past"
              ? "Completed catalysts and what we concluded. Decisions live in the Journal. This is event history, not a work queue."
              : "Public catalyst calendar — earnings, policy windows, and known events. The work queue is Briefing Dated; this page is the dated catalog, not a todo list."}
          </p>
        </div>
      </header>

      <section className="panel" aria-label="Catalyst calendar">
        <div className="upcoming-filters">
          <div className="seg" role="group" aria-label="Calendar view">
            {VIEW_FILTERS.map((option) => (
              <Link
                key={option.id}
                href={calendarHref({
                  view: option.id,
                  when: horizon,
                  scope,
                })}
                className={option.id === view ? "is-active" : undefined}
                aria-current={option.id === view ? "page" : undefined}
              >
                {option.label}
              </Link>
            ))}
          </div>
          {view === "upcoming" ? (
            <div className="seg" role="group" aria-label="When">
              {HORIZON_FILTERS.map((option) => (
                <Link
                  key={option.id}
                  href={calendarHref({ view: "upcoming", when: option.id })}
                  className={option.id === horizon ? "is-active" : undefined}
                  aria-current={option.id === horizon ? "page" : undefined}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          ) : null}
          {view === "past" && signedIn ? (
            <div className="seg" role="group" aria-label="Review scope">
              {PAST_SCOPE_FILTERS.map((option) => (
                <Link
                  key={option.id}
                  href={calendarHref({ view: "past", scope: option.id })}
                  className={option.id === scope ? "is-active" : undefined}
                  aria-current={option.id === scope ? "page" : undefined}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        {rows.length > 0 ? (
          <table className="agenda">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">UTC</th>
                <th scope="col">Event</th>
                <th scope="col">Type</th>
              </tr>
            </thead>
            <tbody>
              {view === "past" ? (
                <AgendaRows
                  days={calendarPastDayGroups(past)}
                  showMonths={showMonths}
                  outcomeAsBody
                />
              ) : (
                <AgendaSection events={upcoming} showMonths={showMonths} />
              )}
            </tbody>
          </table>
        ) : (
          <p className="empty">{emptyCopy(view, horizon, scope)}</p>
        )}
      </section>
    </>
  );
}

function EventTitle({
  title,
  href,
}: {
  title: string;
  href: string | null;
}) {
  if (href) {
    return (
      <strong>
        <Link href={href}>{title}</Link>
      </strong>
    );
  }
  return <strong>{title}</strong>;
}

function SubjectLinks({ subjects }: { subjects: ReviewSubjectLink[] }) {
  if (subjects.length === 0) return null;
  return (
    <div className="muted event-subjects">
      {subjects.map((subject, index) => (
        <span key={`${subject.label}-${subject.href ?? index}`}>
          {index > 0 ? " · " : null}
          {subject.href ? (
            <Link href={subject.href}>{subject.label}</Link>
          ) : (
            subject.label
          )}
        </span>
      ))}
    </div>
  );
}

function AgendaRows({
  days,
  showMonths,
  outcomeAsBody,
}: {
  days: UpcomingDayGroup[];
  showMonths: boolean;
  outcomeAsBody: boolean;
}) {
  let lastMonth = "";
  return (
    <>
      {days.flatMap((day) => {
        const nodes: ReactNode[] = [];
        if (showMonths && day.monthLabel && day.monthLabel !== lastMonth) {
          lastMonth = day.monthLabel;
          nodes.push(
            <tr key={`${day.date ?? "none"}-month`} className="agenda-month">
              <td colSpan={4}>{day.monthLabel}</td>
            </tr>,
          );
        }
        day.rows.forEach((row, index) => {
          nodes.push(
            <AgendaRow
              key={row.key}
              row={row}
              day={day}
              showDate={index === 0}
              outcomeAsBody={outcomeAsBody}
            />,
          );
        });
        return nodes;
      })}
    </>
  );
}

function AgendaRow({
  row,
  day,
  showDate,
  outcomeAsBody,
}: {
  row: UpcomingAgendaRow;
  day: UpcomingDayGroup;
  showDate: boolean;
  outcomeAsBody: boolean;
}) {
  return (
    <tr className={day.isToday ? "is-today" : undefined}>
      <td className="agenda-date">
        {showDate ? (
          <>
            <strong>{day.dayMonth}</strong>
            <span>{weekdayCaption(day)}</span>
          </>
        ) : null}
      </td>
      <td className="agenda-time">{row.time ?? "—"}</td>
      <td>
        <EventTitle title={row.title} href={row.href} />
        <SubjectLinks subjects={row.subjects} />
        {outcomeAsBody && row.instructions ? (
          <div className="event-outcome">{row.instructions}</div>
        ) : null}
      </td>
      <td className="agenda-kind">
        <span className="tag">{row.kindLabel}</span>
      </td>
    </tr>
  );
}

function AgendaSection({
  events,
  showMonths,
}: {
  events: PublicCalendarEvent[];
  showMonths: boolean;
}) {
  return (
    <AgendaRows
      days={calendarDayGroups(events)}
      showMonths={showMonths}
      outcomeAsBody={false}
    />
  );
}
