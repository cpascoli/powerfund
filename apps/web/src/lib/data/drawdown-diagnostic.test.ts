import { describe, expect, it } from "vitest";

import {
  currentBreachStartedOn,
  looksLikeSleeveDiagnostic,
  parseDiagnosedDrawdownPct,
  resolveDrawdownDiagnostic,
  sleeveDiagnosticsFromReviews,
} from "./drawdown-diagnostic";

const asOf = new Date("2026-08-30T18:00:00.000Z");

const portfolioReview = {
  id: "diag-1",
  title: "Mandatory deployed drawdown diagnostic",
  instructions: "Classify the 15% sleeve move.",
  outcome:
    "Mandatory Phase-1 deployed-drawdown diagnostic completed 30 Aug 2026. Unitized deployed drawdown is ~15.3%, but total NAV drawdown is only ~1.2%.",
  completed_at: "2026-08-30T11:15:16.585Z",
  scope: "portfolio",
  status: "completed",
};

describe("sleeve diagnostic recognition", () => {
  it("matches the book-level review and reads the diagnosed print", () => {
    expect(looksLikeSleeveDiagnostic(portfolioReview.title)).toBe(true);
    expect(parseDiagnosedDrawdownPct(portfolioReview.outcome)).toBe(15.3);
    expect(
      parseDiagnosedDrawdownPct(
        `${portfolioReview.title}\n${portfolioReview.instructions}\n${portfolioReview.outcome}`,
      ),
    ).toBe(15.3);
    expect(sleeveDiagnosticsFromReviews([portfolioReview])).toEqual([
      expect.objectContaining({
        id: "diag-1",
        deployedDrawdownPct: 15.3,
      }),
    ]);
  });

  it("ignores a name-level drawdown note and incomplete tasks", () => {
    expect(
      looksLikeSleeveDiagnostic(
        "Fundamentals remain intact after the ~37% drawdown, but the reversal is not confirmed.",
      ),
    ).toBe(false);
    expect(
      sleeveDiagnosticsFromReviews([
        { ...portfolioReview, status: "pending", completed_at: null },
        { ...portfolioReview, id: "theme", scope: "theme" },
      ]),
    ).toEqual([]);
  });
});

describe("current breach episode", () => {
  it("starts on the first day the sleeve stays at or above 15%", () => {
    expect(
      currentBreachStartedOn(
        [
          { date: "2026-08-20", pct: 10 },
          { date: "2026-08-21", pct: 16 },
          { date: "2026-08-30", pct: 15.3 },
        ],
        15,
      ),
    ).toBe("2026-08-21");
  });

  it("is null when the live print is back below the threshold", () => {
    expect(
      currentBreachStartedOn(
        [
          { date: "2026-08-21", pct: 16 },
          { date: "2026-08-30", pct: 14.9 },
        ],
        15,
      ),
    ).toBeNull();
  });
});

describe("resolveDrawdownDiagnostic", () => {
  const records = sleeveDiagnosticsFromReviews([portfolioReview]);
  const daily = [
    { date: "2026-08-21", pct: 16 },
    { date: "2026-08-30", pct: 15.3 },
  ];

  it("is monitoring when a covering diagnostic exists for this breach", () => {
    expect(
      resolveDrawdownDiagnostic({
        breached: true,
        currentPct: 15.3,
        daily,
        records,
        now: asOf,
      }),
    ).toEqual(
      expect.objectContaining({
        status: "monitoring",
        currentPct: 15.3,
      }),
    );
  });

  it("is due until the first covering write exists", () => {
    expect(
      resolveDrawdownDiagnostic({
        breached: true,
        currentPct: 15.3,
        daily,
        records: [],
        now: asOf,
      }).status,
    ).toBe("due");
  });

  it("re-opens after the sleeve recovers and breaches again", () => {
    const prior = sleeveDiagnosticsFromReviews([
      {
        ...portfolioReview,
        id: "diag-aug-24",
        completed_at: "2026-08-24T12:00:00.000Z",
      },
    ]);
    const state = resolveDrawdownDiagnostic({
      breached: true,
      currentPct: 15.1,
      daily: [
        { date: "2026-08-21", pct: 16 },
        { date: "2026-08-28", pct: 14.2 },
        { date: "2026-08-30", pct: 15.1 },
      ],
      records: prior,
      now: asOf,
    });
    expect(state).toEqual(
      expect.objectContaining({ status: "due", reason: "new_episode" }),
    );
  });

  it("re-opens when drawdown deepens by 5 percentage points", () => {
    const state = resolveDrawdownDiagnostic({
      breached: true,
      currentPct: 20.4,
      daily: [
        { date: "2026-08-21", pct: 16 },
        { date: "2026-08-30", pct: 20.4 },
      ],
      records,
      now: asOf,
    });
    expect(state).toEqual(
      expect.objectContaining({ status: "due", reason: "worsened" }),
    );
  });

  it("re-opens after the 14-day re-check", () => {
    const state = resolveDrawdownDiagnostic({
      breached: true,
      currentPct: 15.3,
      daily,
      records,
      now: new Date("2026-09-13T12:00:00.000Z"),
    });
    expect(state).toEqual(
      expect.objectContaining({ status: "due", reason: "stale" }),
    );
  });

  it("is clear when the sleeve is not in breach", () => {
    expect(
      resolveDrawdownDiagnostic({
        breached: false,
        currentPct: 12,
        daily: [{ date: "2026-08-30", pct: 12 }],
        records,
        now: asOf,
      }),
    ).toEqual({ status: "clear" });
  });
});
