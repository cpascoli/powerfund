import { describe, expect, it } from "vitest";
import {
  classifyInflectionDisagreement,
  inflectionHysteresisFrom,
  inflectionTransitionCause,
  scoreInflection,
  type FundamentalQuarter,
  type InflectionInput,
  type InflectionSnapshot,
} from "@powerfund/domain";

const ENDS = [
  "2023-03-31",
  "2023-06-30",
  "2023-09-30",
  "2023-12-31",
  "2024-03-31",
  "2024-06-30",
  "2024-09-30",
  "2024-12-31",
  "2025-03-31",
] as const;

function quarter(
  periodEnd: string,
  revenue: number,
  capex: number,
  freeCashFlow: number,
  netDebt: number,
  sharesDiluted: number,
): FundamentalQuarter {
  return {
    periodEnd,
    revenue,
    capex,
    freeCashFlow,
    netDebt,
    sharesDiluted,
    ingestedAt: "2025-04-10T00:00:00Z",
  };
}

function series(args: {
  revenues: number[];
  capexRatio: number | number[];
  fcfRatio: number | number[];
  netDebt?: number;
  shares?: number | number[];
}): FundamentalQuarter[] {
  return ENDS.map((periodEnd, i) => {
    const revenue = args.revenues[i]!;
    const capexRatio =
      typeof args.capexRatio === "number"
        ? args.capexRatio
        : args.capexRatio[i]!;
    const fcfRatio =
      typeof args.fcfRatio === "number" ? args.fcfRatio : args.fcfRatio[i]!;
    const shares =
      typeof args.shares === "number" || args.shares == null
        ? (args.shares ?? 100)
        : args.shares[i]!;
    return quarter(
      periodEnd,
      revenue,
      revenue * capexRatio,
      revenue * fcfRatio,
      args.netDebt ?? 200,
      shares,
    );
  });
}

const ACCELERATING = [100, 105, 110, 115, 140, 147, 154, 161, 210];
const DECELERATING = [100, 105, 110, 115, 140, 147, 154, 161, 168];

function score(args: {
  revenues?: number[];
  capexRatio?: number | number[];
  fcfRatio?: number | number[];
  shares?: number | number[];
  netDebt?: number;
  closes: number[];
  marketCap?: number | null;
  asOf?: string;
  calculatedAt?: string;
  priceThrough?: string | null;
  calendarThrough?: string | null;
  previous?: InflectionInput["previous"];
}): InflectionSnapshot {
  return scoreInflection({
    quarters: series({
      revenues: args.revenues ?? ACCELERATING,
      capexRatio: args.capexRatio ?? [...Array(8).fill(0.1), 0.16],
      fcfRatio: args.fcfRatio ?? 0.05,
      shares: args.shares,
      netDebt: args.netDebt,
    }),
    closes: args.closes,
    marketCap: args.marketCap === undefined ? 5_000_000_000 : args.marketCap,
    asOf: args.asOf ?? "2025-04-15",
    calculatedAt: args.calculatedAt ?? "2025-04-15T18:00:00Z",
    priceThrough: args.priceThrough,
    calendarThrough: args.calendarThrough,
    previous: args.previous,
  });
}

function rampTo(last: number, n = 200): number[] {
  return Array.from({ length: n }, (_, i) => ((i + 1) / n) * last);
}

/** Oscillate around 100 so crowding stays calm and the last print is not a crash. */
function calmCloses(): number[] {
  return [...Array.from({ length: 100 }, () => 90), ...Array.from({ length: 99 }, () => 110), 100];
}

function flatThen(last: number, n = 200, base = 100): number[] {
  return [...Array.from({ length: n - 1 }, () => base), last];
}

describe("fundamental_inflection_v1 frozen fixtures", () => {
  it("is deterministic: the same frozen inputs always produce the same v1 output", () => {
    const closes = [...rampTo(100), 100];
    const first = score({ closes });
    const second = score({ closes });
    expect(second.setup).toBe(first.setup);
    expect(second.growth.flag).toBe(first.growth.flag);
    expect(second.intensity.flag).toBe(first.intensity.flag);
    expect(second.fcf.flag).toBe(first.fcf.flag);
    expect(classifyInflectionDisagreement(first, second)).toBe("match");
  });

  it("labels a productive build in a calm tape as improving — research now", () => {
    const snapshot = score({ closes: calmCloses() });
    expect(snapshot.growth.flag).toBe("strong");
    expect(snapshot.intensity.flag).toBe("elevated");
    expect(snapshot.fcf.flag).not.toBe("deteriorating");
    expect(snapshot.fundamentalState).toBe("improving");
    expect(snapshot.correction.inCorrection).toBe(false);
    expect(snapshot.setup).toBe("improving_research");
    expect(snapshot.rationale.toLowerCase()).toMatch(/productive|capacity|build/);
  });

  it("labels the same productive build after a 25% drawdown as a correction candidate", () => {
    const snapshot = score({ closes: flatThen(75) });
    expect(snapshot.fundamentalState).toBe("improving");
    expect(snapshot.correction.inCorrection).toBe(true);
    expect(snapshot.crowding.band).toBe("calm");
    expect(snapshot.setup).toBe("correction_candidate");
  });

  it("labels an extended productive build as improving — extended, not a buy", () => {
    const snapshot = score({ closes: rampTo(200) });
    expect(snapshot.fundamentalState).toBe("improving");
    expect(snapshot.crowding.band === "extended" || snapshot.crowding.band === "crowded").toBe(
      true,
    );
    expect(snapshot.setup).toBe("improving_extended");
  });

  it("warns when growth decelerates while investment stays elevated and cash rolls over", () => {
    const snapshot = score({
      revenues: DECELERATING,
      capexRatio: [...Array(8).fill(0.1), 0.18],
      fcfRatio: [...Array(8).fill(0.05), -0.02],
      closes: calmCloses(),
    });
    expect(snapshot.growth.flag).toBe("decelerating");
    expect(snapshot.intensity.flag).toBe("elevated");
    expect(snapshot.fcf.flag).toBe("deteriorating");
    expect(snapshot.fundamentalState).toBe("deteriorating");
    expect(snapshot.setup).toBe("watch");
    expect(snapshot.rationale.toLowerCase()).toMatch(/capital-allocation|warning/);
  });

  it("labels deteriorating names that are still extended as avoid / late-cycle", () => {
    const snapshot = score({
      revenues: DECELERATING,
      capexRatio: [...Array(8).fill(0.1), 0.18],
      fcfRatio: [...Array(8).fill(0.05), -0.02],
      closes: rampTo(200),
    });
    expect(snapshot.fundamentalState).toBe("deteriorating");
    expect(snapshot.setup).toBe("avoid_late");
  });

  it("labels deteriorating names already in a drawdown as falling fundamentals", () => {
    const snapshot = score({
      revenues: DECELERATING,
      capexRatio: [...Array(8).fill(0.1), 0.18],
      fcfRatio: [...Array(8).fill(0.05), -0.02],
      closes: flatThen(75),
    });
    expect(snapshot.setup).toBe("falling_fundamentals");
  });

  it("describes a harvest phase when growth is up, intensity is down, and cash is improving", () => {
    const snapshot = score({
      capexRatio: [...Array(8).fill(0.14), 0.06],
      fcfRatio: [...Array(8).fill(0.04), 0.12],
      closes: [...rampTo(100), 100],
    });
    expect(snapshot.intensity.flag).toBe("down");
    expect(snapshot.fcf.flag).toBe("improving");
    expect(snapshot.rationale.toLowerCase()).toMatch(/harvest|operating-leverage/);
  });

  it("holds growth inflecting inside the hysteresis band and does not enter from stable", () => {
    const mild = [100, 105, 110, 115, 140, 147, 154, 161, 200];
    const staying = score({
      revenues: mild,
      closes: calmCloses(),
      previous: {
        growth: "inflecting",
        intensity: "stable",
        fcf: "stable",
        inCorrection: false,
      },
    });
    const entering = score({
      revenues: mild,
      closes: calmCloses(),
      previous: {
        growth: "stable",
        intensity: "stable",
        fcf: "stable",
        inCorrection: false,
      },
    });
    expect(staying.growth.flag).toBe("inflecting");
    expect(entering.growth.flag).toBe("stable");
  });

  it("marks freshness stale after 150 days without treating it as a failed flag", () => {
    const snapshot = score({
      closes: [...rampTo(100), 100],
      asOf: "2025-09-15",
    });
    expect(snapshot.stale).toBe(true);
    expect(snapshot.fundamentalsStale).toBe(true);
    expect(snapshot.priceDataStale).toBe(false);
    expect(snapshot.missing).toContain("freshness");
    expect(snapshot.completeness).toBe("partial");
    expect(snapshot.rationale.toLowerCase()).toMatch(/stale/);
  });

  it("marks price data stale when last bar misses the last weekday before calculatedAt", () => {
    const snapshot = score({
      closes: calmCloses(),
      asOf: "2025-04-15",
      calculatedAt: "2026-08-22T15:00:00Z",
      priceThrough: "2026-08-19",
    });
    expect(snapshot.fundamentalsStale).toBe(false);
    expect(snapshot.priceDataStale).toBe(true);
    expect(snapshot.stale).toBe(true);
    expect(snapshot.missing).toContain("price_data");
    expect(snapshot.completeness).toBe("partial");
    expect(snapshot.rationale.toLowerCase()).toMatch(/price data/);
  });

  it("does not mark Friday bars stale on Saturday", () => {
    const snapshot = score({
      closes: calmCloses(),
      asOf: "2025-04-15",
      calculatedAt: "2026-08-22T15:00:00Z",
      priceThrough: "2026-08-21",
    });
    expect(snapshot.priceDataStale).toBe(false);
    expect(snapshot.fundamentalsStale).toBe(false);
    expect(snapshot.stale).toBe(false);
  });

  it("marks a name stale when it lags the benchmark calendar", () => {
    const snapshot = score({
      closes: calmCloses(),
      asOf: "2025-04-15",
      calculatedAt: "2026-08-21T21:00:00Z",
      priceThrough: "2026-08-19",
      calendarThrough: "2026-08-21",
    });
    expect(snapshot.priceDataStale).toBe(true);
    expect(snapshot.missing).toContain("price_data");
  });

  it("returns insufficient data when the core series is too short", () => {
    const snapshot = scoreInflection({
      quarters: [
        quarter("2024-12-31", 100, 10, 5, 0, 100),
        quarter("2025-03-31", 110, 12, 6, 0, 100),
      ],
      closes: [10, 11, 12],
      marketCap: null,
      asOf: "2025-04-15",
      calculatedAt: "2025-04-15T18:00:00Z",
    });
    expect(snapshot.setup).toBe("insufficient_data");
    expect(snapshot.completeness).toBe("insufficient");
    expect(snapshot.growth.flag).toBe("unknown");
  });

  it("warns on dilution only when share count is accelerating and intensity or leverage is elevated", () => {
    const warning = score({
      shares: [100, 100, 100, 100, 100, 100, 100, 100, 112],
      closes: [...rampTo(100), 100],
    });
    const quiet = score({
      capexRatio: 0.1,
      shares: [100, 100, 100, 100, 100, 100, 100, 100, 112],
      closes: [...rampTo(100), 100],
    });
    expect(warning.dilution.flag).toBe("accelerating");
    expect(warning.dilution.warning).toBe(true);
    expect(quiet.dilution.flag).toBe("accelerating");
    expect(quiet.dilution.warning).toBe(false);
  });

  it("does not emit a transition on the first run, then records a price move", () => {
    const first = score({ closes: calmCloses() });
    expect(inflectionTransitionCause(null, first)).toBeNull();
    const second = score({
      closes: flatThen(75),
      previous: inflectionHysteresisFrom(first),
    });
    expect(second.setup).toBe("correction_candidate");
    expect(inflectionTransitionCause(first, second)).toBe("price_move");
  });

  it("classifies live-vs-fixture disagreement as inputs, freshness, or scorer regression", () => {
    const fixture = score({ closes: [...rampTo(100), 100] });
    const laterQuarter = score({
      revenues: [...ACCELERATING.slice(0, 8), 230],
      closes: [...rampTo(100), 100],
    });
    expect(classifyInflectionDisagreement(fixture, laterQuarter)).toBe(
      "inputs_changed",
    );

    const stale = score({
      closes: [...rampTo(100), 100],
      asOf: "2025-09-15",
    });
    expect(classifyInflectionDisagreement(fixture, stale)).toBe("data_freshness");

    const mutated: InflectionSnapshot = {
      ...fixture,
      setup: "avoid_late",
      fundamentalState: "deteriorating",
    };
    expect(classifyInflectionDisagreement(fixture, mutated)).toBe(
      "scorer_regression",
    );
  });
});
