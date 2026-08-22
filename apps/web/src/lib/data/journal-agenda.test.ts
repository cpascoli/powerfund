import { describe, expect, it } from "vitest";

import type { DecisionListItem } from "./decisions";
import {
  filterJournalEntries,
  journalDayGroups,
  matchesJournalHorizon,
  parseJournalHorizon,
  startOfUtcWeek,
} from "./journal-agenda";

function decision(
  id: string,
  actionAt: string,
  symbol: string | null = "CLS",
): DecisionListItem {
  return {
    id,
    instrument_id: "i1",
    decision_type: "watch",
    thesis: `${id} thesis`,
    catalysts: null,
    risks: null,
    invalidation: null,
    sizing_rationale: null,
    action_at: actionAt,
    outcome_notes: null,
    outcome_grade: null,
    reviewed_at: null,
    dossier_version_id: null,
    created_at: actionAt,
    symbol,
    instrument_name: symbol,
    dossier_version: null,
  };
}

const saturday = new Date("2026-08-22T15:00:00Z");

describe("journal horizon windows", () => {
  it("starts this UTC week on Monday", () => {
    expect(startOfUtcWeek(saturday).toISOString()).toBe(
      "2026-08-17T00:00:00.000Z",
    );
  });

  it("counts Sunday as the previous week's last day", () => {
    const sunday = new Date("2026-08-16T12:00:00Z");
    expect(startOfUtcWeek(sunday).toISOString()).toBe(
      "2026-08-10T00:00:00.000Z",
    );
  });

  it("keeps this week to Mon–today and last month to July from 22 Aug", () => {
    expect(
      matchesJournalHorizon("2026-08-17T22:00:00Z", "this_week", saturday),
    ).toBe(true);
    expect(
      matchesJournalHorizon("2026-08-16T22:00:00Z", "this_week", saturday),
    ).toBe(false);
    expect(
      matchesJournalHorizon("2026-08-01T12:00:00Z", "this_month", saturday),
    ).toBe(true);
    expect(
      matchesJournalHorizon("2026-07-31T12:00:00Z", "last_month", saturday),
    ).toBe(true);
    expect(
      matchesJournalHorizon("2026-07-31T12:00:00Z", "this_month", saturday),
    ).toBe(false);
  });

  it("parses unknown as this week", () => {
    expect(parseJournalHorizon(undefined)).toBe("this_week");
    expect(parseJournalHorizon("nope")).toBe("this_week");
    expect(parseJournalHorizon("last_month")).toBe("last_month");
  });
});

describe("filterJournalEntries", () => {
  const rows = [
    decision("a", "2026-08-21T10:00:00Z", "CLS"),
    decision("b", "2026-08-03T10:00:00Z", "VRT"),
    decision("c", "2026-07-20T10:00:00Z", "CLS"),
  ];

  it("intersects horizon and company", () => {
    const filtered = filterJournalEntries(rows, "this_month", "CLS", saturday);
    expect(filtered.map((row) => row.id)).toEqual(["a"]);
  });

  it("returns all names when the company filter is empty", () => {
    const filtered = filterJournalEntries(rows, "all", "", saturday);
    expect(filtered.map((row) => row.id)).toEqual(["a", "b", "c"]);
  });
});

describe("journalDayGroups", () => {
  it("groups newest-first days and marks yesterday", () => {
    const groups = journalDayGroups(
      [
        decision("today", "2026-08-22T09:00:00Z"),
        decision("today-2", "2026-08-22T08:00:00Z"),
        decision("yday", "2026-08-21T18:00:00Z"),
      ],
      saturday,
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]?.date).toBe("2026-08-22");
    expect(groups[0]?.isToday).toBe(true);
    expect(groups[0]?.rows).toHaveLength(2);
    expect(groups[1]?.isYesterday).toBe(true);
  });
});
