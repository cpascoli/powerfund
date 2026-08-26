import { describe, expect, it } from "vitest";

import {
  calendarKindLabel,
  calendarMarkdown,
  calendarPastKindLabel,
  calendarPastMarkdown,
  filterCalendarEvents,
  isPublicCatalyst,
  parseCalendarHorizonFilter,
  parseCalendarPastScope,
  parseCalendarView,
  toCalendarAgendaRow,
  toPastCalendarEvent,
  toPublicCalendarEvent,
  type PublicCalendarEvent,
} from "./calendar";
import type { ReviewTaskRecord } from "@/lib/reviews/records";

function task(
  overrides: Partial<ReviewTaskRecord> &
    Pick<ReviewTaskRecord, "id" | "title" | "trigger">,
): ReviewTaskRecord {
  return {
    instructions: "Reassess the thesis. Do not add unless invalidation holds.",
    scope: "company",
    priority: "normal",
    status: "pending",
    evaluable: true,
    symbols: ["NVDA"],
    themes: [{ slug: "ai-infrastructure", name: "AI Infrastructure" }],
    scheduled_for: null,
    not_before: null,
    due_by: null,
    became_due_at: null,
    created_at: "2026-08-01T00:00:00.000Z",
    created_by: "operator",
    completed_at: null,
    outcome: null,
    outputs: [],
    ...overrides,
  };
}

const nvidiaEarnings = task({
  id: "nvda-print",
  title: "NVIDIA Q2 FY27 earnings",
  trigger: { type: "scheduled", at: "2026-08-26T21:00:00.000Z" },
  scheduled_for: "2026-08-26T21:00:00.000Z",
});

describe("public catalyst projection", () => {
  it("publishes scheduled and event-window tasks without instructions", () => {
    const scheduled = toPublicCalendarEvent(nvidiaEarnings);
    expect(scheduled).toEqual({
      id: "nvda-print",
      title: "NVIDIA Q2 FY27 earnings",
      at: "2026-08-26T21:00:00.000Z",
      kind: "scheduled",
      scope: "company",
      symbols: ["NVDA"],
      themes: [{ slug: "ai-infrastructure", name: "AI Infrastructure" }],
      window: null,
    });
    expect(JSON.stringify(scheduled)).not.toContain("instructions");
    expect(JSON.stringify(scheduled)).not.toContain("Do not add");
    expect(JSON.stringify(scheduled)).not.toContain("planned");
    expect(calendarKindLabel("scheduled")).toBe("Event");

    const windowTask = toPublicCalendarEvent(
      task({
        id: "policy",
        title: "NATO budget window",
        scope: "theme",
        symbols: [],
        themes: [{ slug: "defence", name: "Defence" }],
        trigger: {
          type: "event_window",
          not_before: "2026-09-01T00:00:00.000Z",
          due_by: "2026-09-15T00:00:00.000Z",
        },
        not_before: "2026-09-01T00:00:00.000Z",
        due_by: "2026-09-15T00:00:00.000Z",
      }),
    );
    expect(windowTask?.kind).toBe("event_window");
    expect(windowTask?.window).toEqual({
      not_before: "2026-09-01T00:00:00.000Z",
      due_by: "2026-09-15T00:00:00.000Z",
    });
    expect(calendarKindLabel("event_window")).toBe("Window");
  });

  it("projects completed public catalysts with the outcome and holds back operator rows", () => {
    const done = toPastCalendarEvent(
      task({
        id: "nvda-print",
        title: "NVIDIA Q2 FY27 earnings",
        status: "completed",
        trigger: { type: "scheduled", at: "2026-08-26T21:00:00.000Z" },
        scheduled_for: "2026-08-26T21:00:00.000Z",
        completed_at: "2026-08-27T14:00:00.000Z",
        outcome: "Thesis unchanged; wait for data-center guidance.",
      }),
    );
    expect(done).toMatchObject({
      id: "nvda-print",
      title: "NVIDIA Q2 FY27 earnings",
      completed_at: "2026-08-27T14:00:00.000Z",
      outcome: "Thesis unchanged; wait for data-center guidance.",
      is_public: true,
      kind: "scheduled",
    });
    expect(JSON.stringify(done)).not.toContain("Reassess the thesis");
    expect(JSON.stringify(done)).not.toContain("Do not add");
    expect(calendarPastKindLabel(done!)).toBe("Event");

    const kill = task({
      id: "kill",
      title: "NVDA price invalidation",
      status: "completed",
      completed_at: "2026-08-20T00:00:00.000Z",
      outcome: "Still above the line.",
      trigger: {
        type: "condition",
        metric: "price",
        symbol: "NVDA",
        operator: "lt",
        value: 120,
      },
    });
    expect(toPastCalendarEvent(kill)).toBeNull();
    expect(toPastCalendarEvent(kill, true)?.kind).toBe("condition");
    expect(calendarPastKindLabel(toPastCalendarEvent(kill, true)!)).toBe(
      "Condition",
    );

    const book = task({
      id: "book",
      title: "Monthly book pass",
      scope: "portfolio",
      status: "completed",
      completed_at: "2026-08-01T00:00:00.000Z",
      outcome: "Cash and caps still fine.",
      trigger: { type: "scheduled", at: "2026-08-01T00:00:00.000Z" },
      scheduled_for: "2026-08-01T00:00:00.000Z",
    });
    expect(toPastCalendarEvent(book)).toBeNull();
    expect(calendarPastKindLabel(toPastCalendarEvent(book, true)!)).toBe("Book");
  });

  it("holds back price conditions, portfolio reviews, and operator checklists", () => {
    expect(
      isPublicCatalyst(
        task({
          id: "kill",
          title: "NVDA price invalidation",
          trigger: {
            type: "condition",
            metric: "price",
            symbol: "NVDA",
            operator: "lt",
            value: 120,
          },
        }),
      ),
    ).toBe(false);
    expect(
      isPublicCatalyst(
        task({
          id: "book",
          title: "Monthly book pass",
          scope: "portfolio",
          trigger: { type: "scheduled", at: "2026-09-01T00:00:00.000Z" },
          scheduled_for: "2026-09-01T00:00:00.000Z",
        }),
      ),
    ).toBe(false);
    expect(toPublicCalendarEvent(nvidiaEarnings)?.title).not.toMatch(/add/i);
    const row = toCalendarAgendaRow(toPublicCalendarEvent(nvidiaEarnings)!);
    expect(row.instructions).toBeNull();
    expect(row.href).toBe("/explore/NVDA");
  });
});

describe("calendar horizons", () => {
  const asOf = new Date("2026-08-22T12:00:00.000Z");

  function event(
    id: string,
    at: string,
    extras: Partial<PublicCalendarEvent> = {},
  ): PublicCalendarEvent {
    return {
      id,
      title: id,
      at,
      kind: "scheduled",
      scope: "company",
      symbols: ["NVDA"],
      themes: [],
      window: null,
      ...extras,
    };
  }

  it("defaults to this month and buckets week / month / later", () => {
    expect(parseCalendarHorizonFilter(undefined)).toBe("this_month");
    expect(parseCalendarHorizonFilter("this_week")).toBe("this_week");
    expect(parseCalendarView(undefined)).toBe("upcoming");
    expect(parseCalendarView("past")).toBe("past");
    expect(parseCalendarPastScope("operator", false)).toBe("public");
    expect(parseCalendarPastScope("operator", true)).toBe("operator");
    const events = [
      event("today", "2026-08-22T13:30:00.000Z"),
      event("week", "2026-08-26T21:00:00.000Z"),
      event("month", "2026-08-30T00:00:00.000Z"),
      event("next", "2026-09-10T00:00:00.000Z"),
      event("later", "2026-10-02T00:00:00.000Z"),
      event("stale", "2026-07-01T00:00:00.000Z"),
    ];
    expect(
      filterCalendarEvents(events, "this_week", asOf).map((row) => row.id),
    ).toEqual(["today", "week"]);
    expect(
      filterCalendarEvents(events, "this_month", asOf).map((row) => row.id),
    ).toEqual(["today", "week", "month"]);
    expect(
      filterCalendarEvents(events, "next_month", asOf).map((row) => row.id),
    ).toEqual(["next"]);
    expect(
      filterCalendarEvents(events, "later", asOf).map((row) => row.id),
    ).toEqual(["later"]);
  });

  it("renders markdown without private fields", () => {
    const md = calendarMarkdown([toPublicCalendarEvent(nvidiaEarnings)!]);
    expect(md).toContain("NVIDIA Q2 FY27 earnings");
    expect(md).toContain("NVDA");
    expect(md).not.toContain("invalidation");
    expect(md).not.toContain("planned");

    const pastMd = calendarPastMarkdown([
      toPastCalendarEvent(
        task({
          ...nvidiaEarnings,
          status: "completed",
          completed_at: "2026-08-27T14:00:00.000Z",
          outcome: "Thesis unchanged.",
        }),
      )!,
    ]);
    expect(pastMd).toContain("Thesis unchanged.");
    expect(pastMd).not.toContain("Reassess the thesis");
    expect(pastMd).not.toContain("Do not add");
  });
});
