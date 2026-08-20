import { describe, expect, it } from "vitest";

import {
  assembleDossierSnapshot,
  snapshotsEqual,
} from "./versions";

const snapshot = assembleDossierSnapshot({
  status: "investigate",
  summary: "Same thesis",
  thesis: "Buy quality",
  catalysts: null,
  risks: "Multiple",
  invalidation: null,
  competitive_notes: null,
  next_diligence: null,
  source: null,
  research_level: "screened",
  as_of_at: "2026-08-14T00:00:00.000Z",
  verified_at: null,
  next_review_at: null,
});

describe("dossier snapshots", () => {
  it("treats key order as irrelevant", () => {
    const shuffled = {
      next_review_at: null,
      summary: "Same thesis",
      status: "investigate",
      as_of_at: "2026-08-14T00:00:00.000Z",
      thesis: "Buy quality",
      catalysts: null,
      risks: "Multiple",
      invalidation: null,
      competitive_notes: null,
      next_diligence: null,
      source: null,
      research_level: "screened",
      verified_at: null,
    };
    expect(snapshotsEqual(snapshot, shuffled)).toBe(true);
  });

  it("detects material field changes", () => {
    expect(
      snapshotsEqual(snapshot, { ...snapshot, summary: "Changed" }),
    ).toBe(false);
  });
});
