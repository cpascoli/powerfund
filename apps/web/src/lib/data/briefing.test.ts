import { describe, expect, it } from "vitest";

import {
  buildAttentionItems,
  upcomingSections,
  type BriefingReview,
} from "./briefing";
import type { PlannedActionRow } from "./planned-actions";
import type { PortfolioBook } from "./portfolio";

const emptyBook: PortfolioBook = {
  positions: [],
  invested: 0,
  marketValue: 0,
  unrealizedPnl: 0,
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
};

const nvidiaReview: BriefingReview = {
  id: "a75a0cbc-a7d4-4169-a0b0-6f27861b81f5",
  title: "Review NVIDIA Q2 FY27 earnings and reassess AI deployment",
  status: "pending",
  scheduled_for: "2026-08-26T21:00:00.000Z",
  not_before: "2026-08-26T21:00:00.000Z",
  due_by: null,
  symbols: ["ANET", "CLS", "CRDO", "NBIS", "NVDA", "NVT", "VRT"],
  themes: [{ slug: "ai-infrastructure", name: "AI Infrastructure" }],
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
  it("puts a pending scheduled review on Upcoming this week before it is due", () => {
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
      dossiers: [],
      instruments: [],
      reviews: [nvidiaReview],
      today: asOf,
    });
    expect(attention.map((row) => row.kind)).not.toContain("review_due");
  });

  it("moves the review to Attention after the scheduled instant", () => {
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
      dossiers: [],
      instruments: [],
      reviews: [dueReview],
      today: asOf,
    });
    expect(attention).toEqual([
      expect.objectContaining({
        kind: "review_due",
        title: nvidiaReview.title,
        href: "/themes#ai-infrastructure",
      }),
    ]);
  });

  it("keeps planned trades distinct from reviews in the same week", () => {
    const asOf = new Date("2026-08-20T18:00:00.000Z");
    const sections = upcomingSections([action()], [nvidiaReview], asOf);
    expect(sections[0]?.items.map((item) => item.kind)).toEqual([
      "planned_action",
      "review",
    ]);
  });
});
