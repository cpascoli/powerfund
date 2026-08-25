import { describe, expect, it } from "vitest";

import {
  calendarKindLabel,
  calendarMarkdown,
  filterCalendarEvents,
  isPublicCatalyst,
  parseCalendarHorizonFilter,
  toCalendarAgendaRow,
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
  });
});
