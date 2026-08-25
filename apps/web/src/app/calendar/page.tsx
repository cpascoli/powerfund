import type { ReactNode } from "react";
import Link from "next/link";

import {
  calendarDayGroups,
  filterCalendarEvents,
  listPublicCalendarEvents,
  parseCalendarHorizonFilter,
  type CalendarHorizonFilter,
  type PublicCalendarEvent,
} from "@/lib/data/calendar";
import type {
  ReviewSubjectLink,
  UpcomingDayGroup,
} from "@/lib/data/briefing";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Calendar",
  description:
    "Dated catalysts Power Fund monitors — earnings, policy windows, and known events.",
};

const HORIZON_FILTERS: Array<{ id: CalendarHorizonFilter; label: string }> = [
  { id: "this_week", label: "This week" },
  { id: "this_month", label: "This month" },
  { id: "next_month", label: "Next month" },
  { id: "later", label: "Later" },
];

function calendarHref(when: CalendarHorizonFilter): string {
  if (when === "this_month") return "/calendar";
  return `/calendar?when=${when}`;
}

function weekdayCaption(day: UpcomingDayGroup): string {
  if (day.isToday) return "Today";
  if (day.isTomorrow) return "Tomorrow";
  return day.weekday;
}

function emptyCopy(horizon: CalendarHorizonFilter): string {
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
  searchParams: Promise<{ when?: string }>;
}) {
  const { when: whenRaw } = await searchParams;
  const horizon = parseCalendarHorizonFilter(whenRaw);
  const events = filterCalendarEvents(await listPublicCalendarEvents(), horizon);
  const showMonths = horizon !== "this_week";

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Calendar</h1>
          <p>
            Dated catalysts we monitor — earnings, policy windows, and known
            events. Not a trade list.
          </p>
        </div>
      </header>

      <section className="panel" aria-label="Catalyst calendar">
        <div className="upcoming-filters">
          <div className="seg" role="group" aria-label="When">
            {HORIZON_FILTERS.map((option) => (
              <Link
                key={option.id}
                href={calendarHref(option.id)}
                className={option.id === horizon ? "is-active" : undefined}
                aria-current={option.id === horizon ? "page" : undefined}
              >
                {option.label}
              </Link>
            ))}
          </div>
        </div>
        {events.length > 0 ? (
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
              <AgendaSection events={events} showMonths={showMonths} />
            </tbody>
          </table>
        ) : (
          <p className="empty">{emptyCopy(horizon)}</p>
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

function AgendaSection({
  events,
  showMonths,
}: {
  events: PublicCalendarEvent[];
  showMonths: boolean;
}) {
  const days = calendarDayGroups(events);
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
            <tr
              key={row.key}
              className={day.isToday ? "is-today" : undefined}
            >
              <td className="agenda-date">
                {index === 0 ? (
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
              </td>
              <td className="agenda-kind">
                <span className="tag">{row.kindLabel}</span>
              </td>
            </tr>,
          );
        });
        return nodes;
      })}
    </>
  );
}
