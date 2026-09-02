import { describe, expect, it } from "vitest";

import {
  buildAttentionItems,
  buildResearchItems,
  filterUpcomingItems,
  flattenUpcomingItems,
  toUpcomingAgendaRow,
  upcomingDayGroups,
  upcomingSections,
  type BriefingReview,
  type UpcomingItem,
} from "./briefing";
import type { PlannedActionRow } from "./planned-actions";
import type { PortfolioBook } from "./portfolio";
import type { InstrumentWithTheme } from "./research";

const emptyBook: PortfolioBook = {
  positions: [],
  invested: 0,
  marketValue: 0,
  unrealizedPnl: 0,
  dayPnl: null,
  dayPnlPct: null,
  openCount: 0,
  cash: 0,
  nav: 0,
  cashPctNav: 100,
  themeExposures: [],
  flags: [],
  cashUpdatedAt: null,
  cashNotes: null,
  markLabel: "Last close",
  markAsOf: null,
  tapeActive: false,
  priceDataThrough: null,
};

const nvidiaReview: BriefingReview = {
  id: "a75a0cbc-a7d4-4169-a0b0-6f27861b81f5",
  title: "Review NVIDIA Q2 FY27 earnings and reassess AI deployment",
  instructions:
    "Re-read the AI-capex thesis after the print. Do not add unless invalidation still holds.",
  status: "pending",
  scheduled_for: "2026-08-26T21:00:00.000Z",
  not_before: "2026-08-26T21:00:00.000Z",
  due_by: null,
  symbols: ["ANET", "CLS", "CRDO", "NBIS", "NVDA", "NVT", "VRT"],
  themes: [{ slug: "ai-infrastructure", name: "AI Infrastructure" }],
  scope: "theme",
  trigger: { type: "scheduled" },
};

function action(overrides: Partial<PlannedActionRow> = {}): PlannedActionRow {
  return {
    id: "action-1",
    instrumentId: "inst-1",
    symbol: "MRCY",
    name: "Mercury",
    themeName: "Defence",
    themeSlug: "defence",
    actionType: "buy",
    status: "pending",
    plannedUsd: 1000,
    plannedPctNav: 1,
    windowLabel: null,
    dueBy: "2026-08-24",
    rationale: null,
    createdAt: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("briefing reviews", () => {
  it("puts a pending scheduled review on Dated this week before it is due", () => {
    const asOf = new Date("2026-08-20T18:00:00.000Z");
    const sections = upcomingSections([], [nvidiaReview], asOf);
    expect(sections[0]?.items).toEqual([
      expect.objectContaining({
        kind: "review",
        id: nvidiaReview.id,
      }),
    ]);
    const attention = buildAttentionItems({
      bookFlags: [],
      queueFlags: [],
      queue: [],
      book: emptyBook,
      decisions: [],
      reviews: [nvidiaReview],
      today: asOf,
    });
    expect(attention.map((row) => row.kind)).not.toContain("review_due");
  });

  it("moves the review to Due after the scheduled instant", () => {
    const asOf = new Date("2026-08-26T21:00:00.000Z");
    const dueReview = { ...nvidiaReview, status: "due" as const };
    const sections = upcomingSections([], [dueReview], asOf);
    expect(sections.every((section) => section.items.length === 0)).toBe(true);
    const attention = buildAttentionItems({
      bookFlags: [],
      queueFlags: [],
      queue: [],
      book: emptyBook,
      decisions: [],
      reviews: [dueReview],
      today: asOf,
    });
    expect(attention).toEqual([
      expect.objectContaining({
        kind: "review_due",
        title: nvidiaReview.title,
        href: null,
        instructions: nvidiaReview.instructions,
        subjects: expect.arrayContaining([
          { label: "AI Infrastructure", href: "/explore?theme=ai-infrastructure" },
          { label: "NVDA", href: "/explore/NVDA" },
        ]),
      }),
    ]);
  });

  it("groups same-day reviews and extracts UTC time, hiding midnight", () => {
    const asOf = new Date("2026-08-21T09:00:00.000Z");
    const pce: BriefingReview = {
      ...nvidiaReview,
      id: "pce",
      title: "Assess PCE/GDP reaction before NVIDIA",
      scheduled_for: "2026-08-26T13:30:00.000Z",
      not_before: "2026-08-26T13:30:00.000Z",
      symbols: [],
      themes: [],
    };
    const settlement: BriefingReview = {
      ...nvidiaReview,
      id: "nbis-financing",
      title: "Review NBIS financing settlement and dilution impact",
      scheduled_for: "2026-08-24T00:00:00.000Z",
      not_before: "2026-08-24T00:00:00.000Z",
      symbols: ["NBIS"],
      themes: [],
    };
    const sections = upcomingSections([], [settlement, pce, nvidiaReview], asOf);
    const thisWeek = upcomingDayGroups(sections[0]?.items ?? [], asOf);
    expect(thisWeek.map((day) => day.dayMonth)).toEqual(["24 Aug", "26 Aug"]);
    expect(thisWeek[0]?.rows[0]?.time).toBeNull();
    expect(thisWeek[1]?.rows.map((row) => row.time)).toEqual(["13:30", "21:00"]);
  });

  it("keeps planned trades distinct from reviews in the same week", () => {
    const asOf = new Date("2026-08-20T18:00:00.000Z");
    const sections = upcomingSections([action()], [nvidiaReview], asOf);
    expect(sections[0]?.items.map((item) => item.kind)).toEqual([
      "planned_action",
      "review",
    ]);
    expect(
      toUpcomingAgendaRow(sections[0]!.items[0] as UpcomingItem).href,
    ).toBe("/portfolio?confirm=action-1");
  });

  it("shows review instructions and links subjects, not the title", () => {
    const bwxt: BriefingReview = {
      id: "bwxt-review",
      title: "Review BWXT bottoming/reversal structure",
      instructions:
        "Check weekly close vs the August low. Do not queue a buy unless the structure confirms.",
      status: "pending",
      scheduled_for: "2026-08-28T00:00:00.000Z",
      not_before: "2026-08-28T00:00:00.000Z",
      due_by: null,
      symbols: ["BWXT"],
      themes: [{ slug: "defence", name: "Defence" }],
    };
    const row = toUpcomingAgendaRow({
      kind: "review",
      id: bwxt.id,
      review: bwxt,
    });
    expect(row.href).toBeNull();
    expect(row.title).toBe(bwxt.title);
    expect(row.instructions).toBe(bwxt.instructions);
    expect(row.subjects).toEqual([
      { label: "Defence", href: "/explore?theme=defence" },
      { label: "BWXT", href: "/explore/BWXT" },
    ]);

    const themeOnly = toUpcomingAgendaRow({
      kind: "review",
      id: "theme-review",
      review: {
        ...bwxt,
        id: "theme-review",
        symbols: [],
        themes: [{ slug: "energy", name: "Energy" }],
      },
    });
    expect(themeOnly.subjects).toEqual([
      { label: "Energy", href: "/explore?theme=energy" },
    ]);
  });
});

describe("upcoming filters", () => {
  it("filters reviews vs planned trades", () => {
    const asOf = new Date("2026-08-20T18:00:00.000Z");
    const items = flattenUpcomingItems(
      upcomingSections([action()], [nvidiaReview], asOf),
    );
    expect(filterUpcomingItems(items, "review", "this_week", asOf).map((row) => row.kind)).toEqual([
      "review",
    ]);
    expect(filterUpcomingItems(items, "planned", "this_week", asOf).map((row) => row.kind)).toEqual([
      "planned_action",
    ]);
    expect(
      filterUpcomingItems(items, "catalysts", "this_week", asOf).map((row) => row.id),
    ).toEqual([nvidiaReview.id]);
  });

  it("buckets this week, this month, next month, and later", () => {
    const asOf = new Date("2026-08-22T12:00:00.000Z");
    const september: BriefingReview = {
      ...nvidiaReview,
      id: "sep",
      title: "September check",
      scheduled_for: "2026-09-10T00:00:00.000Z",
      not_before: "2026-09-10T00:00:00.000Z",
      symbols: ["NVDA"],
      themes: [],
    };
    const october: BriefingReview = {
      ...nvidiaReview,
      id: "oct",
      title: "October check",
      scheduled_for: "2026-10-02T00:00:00.000Z",
      not_before: "2026-10-02T00:00:00.000Z",
      symbols: ["NVDA"],
      themes: [],
    };
    const lateAugust: BriefingReview = {
      ...nvidiaReview,
      id: "aug-30",
      title: "Late August check",
      scheduled_for: "2026-08-30T00:00:00.000Z",
      not_before: "2026-08-30T00:00:00.000Z",
      symbols: ["NVDA"],
      themes: [],
    };
    const items = flattenUpcomingItems(
      upcomingSections([], [nvidiaReview, lateAugust, september, october], asOf),
    );
    expect(
      filterUpcomingItems(items, "all", "this_week", asOf).map((row) => row.id),
    ).toEqual([nvidiaReview.id]);
    expect(
      filterUpcomingItems(items, "all", "this_month", asOf).map((row) => row.id),
    ).toEqual([nvidiaReview.id, "aug-30"]);
    expect(
      filterUpcomingItems(items, "all", "next_month", asOf).map((row) => row.id),
    ).toEqual(["sep"]);
    expect(
      filterUpcomingItems(items, "all", "later", asOf).map((row) => row.id),
    ).toEqual(["oct"]);
  });

  it("keeps undated planned trades on every horizon, after dated matches", () => {
    const asOf = new Date("2026-08-22T12:00:00.000Z");
    const undated = [
      action({ id: "open-1", symbol: "CLS", dueBy: null }),
      action({ id: "open-2", symbol: "NVT", dueBy: null }),
      action({ id: "open-3", symbol: "VST", dueBy: null }),
    ];
    const october: BriefingReview = {
      ...nvidiaReview,
      id: "oct",
      title: "October check",
      scheduled_for: "2026-10-02T00:00:00.000Z",
      not_before: "2026-10-02T00:00:00.000Z",
      symbols: ["NVDA"],
      themes: [],
    };
    const items = flattenUpcomingItems(
      upcomingSections(undated, [nvidiaReview, october], asOf),
    );
    const undatedIds = ["open-1", "open-2", "open-3"];
    expect(
      filterUpcomingItems(items, "all", "this_week", asOf).map((row) => row.id),
    ).toEqual([nvidiaReview.id, ...undatedIds]);
    expect(
      filterUpcomingItems(items, "all", "this_month", asOf).map((row) => row.id),
    ).toEqual([nvidiaReview.id, ...undatedIds]);
    expect(
      filterUpcomingItems(items, "all", "next_month", asOf).map((row) => row.id),
    ).toEqual(undatedIds);
    expect(
      filterUpcomingItems(items, "all", "later", asOf).map((row) => row.id),
    ).toEqual(["oct", ...undatedIds]);
  });
});

const clsInstrument: InstrumentWithTheme = {
  id: "inst-cls",
  symbol: "CLS",
  data_symbol: null,
  name: "Celestica",
  asset_class: "equity",
  status: "watchlist",
  notes: null,
  theme_slug: "ai-infrastructure",
  theme_name: "AI Infrastructure",
  has_dossier: true,
};

describe("research inbox", () => {
  const asOf = new Date("2026-08-30T12:00:00.000Z");

  it("lists names without a dossier", () => {
    const items = buildResearchItems({
      instruments: [clsInstrument],
      dossiers: [],
      book: emptyBook,
      today: asOf,
    });
    expect(items).toEqual([
      expect.objectContaining({
        kind: "needs_dossier",
        title: "Write a dossier for CLS",
      }),
    ]);
  });

  it("uses next_review_at when set, not the 14-day save clock", () => {
    const items = buildResearchItems({
      instruments: [clsInstrument],
      dossiers: [
        {
          instrumentId: clsInstrument.id,
          status: "investigate",
          nextDiligence: "Verify FY26 guidance vs the 10-Q.",
          nextReviewAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-15T00:00:00.000Z",
        },
      ],
      book: emptyBook,
      today: asOf,
    });
    expect(items.map((row) => row.kind)).toEqual(["review_due_date"]);
  });

  it("does not fire 14-day diligence when a future review date is set", () => {
    const items = buildResearchItems({
      instruments: [clsInstrument],
      dossiers: [
        {
          instrumentId: clsInstrument.id,
          status: "investigate",
          nextDiligence: "Verify FY26 guidance vs the 10-Q.",
          nextReviewAt: "2026-09-15T00:00:00.000Z",
          updatedAt: "2026-08-15T00:00:00.000Z",
        },
      ],
      book: emptyBook,
      today: asOf,
    });
    expect(items).toEqual([]);
  });

  it("falls back to 14-day next-diligence when no review date is set", () => {
    const attention = buildAttentionItems({
      bookFlags: [],
      queueFlags: [],
      queue: [],
      book: emptyBook,
      decisions: [],
      today: asOf,
    });
    expect(attention).toEqual([]);
    const items = buildResearchItems({
      instruments: [clsInstrument],
      dossiers: [
        {
          instrumentId: clsInstrument.id,
          status: "investigate",
          nextDiligence: "Verify FY26 guidance vs the 10-Q.",
          nextReviewAt: null,
          updatedAt: "2026-08-15T00:00:00.000Z",
        },
      ],
      book: emptyBook,
      today: asOf,
    });
    expect(items).toEqual([
      expect.objectContaining({
        kind: "diligence",
        title: "Next diligence on CLS",
      }),
    ]);
  });
});

describe("drawdown diagnostic on Due", () => {
  const asOf = new Date("2026-08-30T18:00:00.000Z");

  it("omits a covered sleeve diagnostic from Due", () => {
    const attention = buildAttentionItems({
      bookFlags: [
        {
          code: "drawdown_kill_switch",
          severity: "warn",
          due: false,
          label:
            "Unitized deployed drawdown 15.3% — diagnostic completed; monitoring",
        },
      ],
      queueFlags: [],
      queue: [],
      book: emptyBook,
      decisions: [],
      today: asOf,
    });
    expect(attention).toEqual([]);
  });

  it("keeps an uncovered sleeve diagnostic on Due", () => {
    const attention = buildAttentionItems({
      bookFlags: [
        {
          code: "drawdown_kill_switch",
          severity: "warn",
          label:
            "Unitized deployed drawdown 15.3% — mandatory diagnostic (Phase 1: does not halt new buys)",
        },
      ],
      queueFlags: [],
      queue: [],
      book: emptyBook,
      decisions: [],
      today: asOf,
    });
    expect(attention).toEqual([
      expect.objectContaining({
        kind: "flag",
        title: expect.stringContaining("mandatory diagnostic"),
      }),
    ]);
  });
});
