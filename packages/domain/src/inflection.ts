import { computeCrowding, type CrowdingBand } from "./crowding";
import { priceDataStale } from "./dates";

export const INFLECTION_SCORER_KEY = "fundamental_inflection_v1";
export const INFLECTION_SCORER_VERSION = 1;

/** Named v1 thresholds. Change only with a version bump. */
export const INFLECTION_THRESHOLDS = {
  growthEnterPp: 5,
  growthLeavePp: 2,
  growthStrongPp: 8,
  growthDecelEnterPp: -5,
  growthDecelLeavePp: -2,
  intensityEnterPp: 3,
  intensityLeavePp: 1,
  fcfDeteriorateEnterPp: -3,
  fcfDeteriorateLeavePp: -1,
  correctionEnterPct: -20,
  correctionLeavePct: -12,
  dilutionObservePct: 5,
  leverageModestMax: 0.2,
  leverageElevatedMax: 0.5,
  staleAfterDays: 150,
  minClosesForPrice: 60,
  minQuartersForYoy: 5,
  priorYoyCount: 4,
} as const;

export type InflectionThresholds = typeof INFLECTION_THRESHOLDS;

export type TrendFlag =
  | "strong"
  | "inflecting"
  | "stable"
  | "decelerating"
  | "unknown";
export type IntensityFlag = "elevated" | "stable" | "down" | "unknown";
export type QualityFlag = "improving" | "stable" | "deteriorating" | "unknown";
export type LeverageFlag =
  | "net_cash"
  | "modest"
  | "elevated"
  | "stressed"
  | "unknown";
export type DilutionFlag = "accelerating" | "stable" | "shrinking" | "unknown";
export type Completeness = "complete" | "partial" | "insufficient";
export type FundamentalState =
  | "improving"
  | "stable"
  | "deteriorating"
  | "unknown";
export type InflectionSetup =
  | "improving_research"
  | "improving_extended"
  | "correction_candidate"
  | "thesis_check"
  | "watch"
  | "falling_fundamentals"
  | "avoid_late"
  | "insufficient_data";
export type TransitionCause =
  | "new_quarter"
  | "price_move"
  | "crowding_change"
  | "data_completeness";
export type InflectionDisagreement =
  | "match"
  | "inputs_changed"
  | "data_freshness"
  | "scorer_regression";

export type FundamentalQuarter = {
  periodEnd: string;
  revenue: number | null;
  capex: number | null;
  freeCashFlow: number | null;
  netDebt: number | null;
  sharesDiluted: number | null;
  ingestedAt: string | null;
};

export type InflectionHysteresis = {
  growth: TrendFlag;
  intensity: IntensityFlag;
  fcf: QualityFlag;
  inCorrection: boolean;
};

export type InflectionInput = {
  quarters: FundamentalQuarter[];
  closes: number[];
  marketCap: number | null;
  asOf: string;
  calculatedAt: string;
  /** Last bar date for this name. Omit to treat `asOf` as the last session. */
  priceThrough?: string | null;
  /** Last bar date on the success-benchmark calendar (SPY). */
  calendarThrough?: string | null;
  previous?: InflectionHysteresis | null;
  thresholds?: InflectionThresholds;
};

export type InflectionSnapshot = {
  scorerKey: typeof INFLECTION_SCORER_KEY;
  scorerVersion: typeof INFLECTION_SCORER_VERSION;
  asOf: string;
  calculatedAt: string;
  periodEnd: string | null;
  ingestedAt: string | null;
  completeness: Completeness;
  fundamentalsStale: boolean;
  priceDataThrough: string | null;
  priceDataStale: boolean;
  stale: boolean;
  daysSincePeriodEnd: number | null;
  missing: string[];
  closesCount: number;
  growth: {
    flag: TrendFlag;
    latestYoyPct: number | null;
    priorMedianYoyPct: number | null;
    deltaPp: number | null;
  };
  intensity: {
    flag: IntensityFlag;
    latestCapexToSalesPct: number | null;
    priorMedianCapexToSalesPct: number | null;
    deltaPp: number | null;
  };
  fcf: {
    flag: QualityFlag;
    latestFcfToSalesPct: number | null;
    priorMedianFcfToSalesPct: number | null;
    deltaPp: number | null;
  };
  balanceSheet: {
    flag: LeverageFlag;
    netDebt: number | null;
    netDebtToMarketCap: number | null;
  };
  dilution: {
    flag: DilutionFlag;
    latestShares: number | null;
    yearAgoShares: number | null;
    changePct: number | null;
    warning: boolean;
  };
  crowding: {
    band: CrowdingBand | "unknown";
    pricePercentile: number | null;
    extensionPct: number | null;
  };
  correction: {
    inCorrection: boolean;
    drawdownFromHighPct: number | null;
    highClose: number | null;
    lastClose: number | null;
  };
  fundamentalState: FundamentalState;
  setup: InflectionSetup;
  rationale: string;
};

const SETUP_RANK: Record<InflectionSetup, number> = {
  correction_candidate: 0,
  improving_research: 1,
  improving_extended: 2,
  thesis_check: 3,
  watch: 4,
  falling_fundamentals: 5,
  avoid_late: 6,
  insufficient_data: 7,
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function yoy(current: number, yearAgo: number): number | null {
  if (yearAgo === 0) return null;
  return (current - yearAgo) / Math.abs(yearAgo);
}

function ratio(num: number | null, den: number | null): number | null {
  if (num == null || den == null || den === 0) return null;
  return num / den;
}

function utcDaysBetween(laterIso: string, earlierIso: string): number | null {
  const later = Date.parse(`${laterIso.slice(0, 10)}T00:00:00Z`);
  const earlier = Date.parse(`${earlierIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(later) || Number.isNaN(earlier)) return null;
  return Math.round((later - earlier) / 86_400_000);
}

function resolvePriceFreshness(input: InflectionInput): {
  priceDataThrough: string | null;
  priceDataStale: boolean;
} {
  const priceDataThrough =
    input.priceThrough !== undefined ? input.priceThrough : input.asOf;
  const behindClock = priceDataStale(priceDataThrough, input.calculatedAt);
  const calendarThrough = input.calendarThrough ?? null;
  const behindCalendar =
    calendarThrough != null &&
    (priceDataThrough == null ||
      priceDataThrough === "" ||
      priceDataThrough < calendarThrough);
  return {
    priceDataThrough,
    priceDataStale: behindClock || behindCalendar,
  };
}

function hysteresisOn(
  value: number,
  enter: number,
  leave: number,
  wasOn: boolean,
): boolean {
  return wasOn ? value >= leave : value >= enter;
}

function latestVsPriorMedian(
  values: Array<{ value: number }>,
  priorCount: number,
): { latest: number; priorMedian: number; deltaPp: number } | null {
  if (values.length < priorCount + 1) return null;
  const latest = values[values.length - 1]!.value;
  const prior = values.slice(-(priorCount + 1), -1).map((row) => row.value);
  const priorMedian = median(prior);
  if (priorMedian == null) return null;
  return {
    latest,
    priorMedian,
    deltaPp: (latest - priorMedian) * 100,
  };
}

function seriesRatios(
  quarters: FundamentalQuarter[],
  pick: (row: FundamentalQuarter) => number | null,
): Array<{ value: number }> {
  const rows: Array<{ value: number }> = [];
  for (const row of quarters) {
    const value = ratio(pick(row), row.revenue);
    if (value == null) continue;
    rows.push({ value });
  }
  return rows;
}

function classifyGrowth(
  deltaPp: number,
  previous: TrendFlag | undefined,
  t: InflectionThresholds,
): TrendFlag {
  const wasUp = previous === "inflecting" || previous === "strong";
  const wasDown = previous === "decelerating";
  if (deltaPp >= t.growthStrongPp) return "strong";
  if (hysteresisOn(deltaPp, t.growthEnterPp, t.growthLeavePp, wasUp)) {
    return "inflecting";
  }
  if (
    hysteresisOn(
      -deltaPp,
      -t.growthDecelEnterPp,
      -t.growthDecelLeavePp,
      wasDown,
    )
  ) {
    return "decelerating";
  }
  return "stable";
}

function classifyIntensity(
  deltaPp: number,
  previous: IntensityFlag | undefined,
  t: InflectionThresholds,
): IntensityFlag {
  const wasUp = previous === "elevated";
  const wasDown = previous === "down";
  if (hysteresisOn(deltaPp, t.intensityEnterPp, t.intensityLeavePp, wasUp)) {
    return "elevated";
  }
  if (hysteresisOn(-deltaPp, t.intensityEnterPp, t.intensityLeavePp, wasDown)) {
    return "down";
  }
  return "stable";
}

function classifyFcf(
  deltaPp: number,
  previous: QualityFlag | undefined,
  t: InflectionThresholds,
): QualityFlag {
  const wasBad = previous === "deteriorating";
  const wasGood = previous === "improving";
  if (
    hysteresisOn(
      -deltaPp,
      -t.fcfDeteriorateEnterPp,
      -t.fcfDeteriorateLeavePp,
      wasBad,
    )
  ) {
    return "deteriorating";
  }
  if (hysteresisOn(deltaPp, t.intensityEnterPp, t.intensityLeavePp, wasGood)) {
    return "improving";
  }
  return "stable";
}

function classifyLeverage(
  netDebtToMarketCap: number | null,
  t: InflectionThresholds,
): LeverageFlag {
  if (netDebtToMarketCap == null) return "unknown";
  if (netDebtToMarketCap < 0) return "net_cash";
  if (netDebtToMarketCap < t.leverageModestMax) return "modest";
  if (netDebtToMarketCap < t.leverageElevatedMax) return "elevated";
  return "stressed";
}

function classifyDilution(
  changePct: number | null,
  t: InflectionThresholds,
): DilutionFlag {
  if (changePct == null) return "unknown";
  if (changePct >= t.dilutionObservePct) return "accelerating";
  if (changePct <= -t.dilutionObservePct) return "shrinking";
  return "stable";
}

function classifyFundamental(growth: TrendFlag): FundamentalState {
  switch (growth) {
    case "strong":
    case "inflecting":
      return "improving";
    case "stable":
      return "stable";
    case "decelerating":
      return "deteriorating";
    case "unknown":
      return "unknown";
    default: {
      const _exhaustive: never = growth;
      return _exhaustive;
    }
  }
}

function triadRationale(
  growth: TrendFlag,
  intensity: IntensityFlag,
  fcf: QualityFlag,
): string {
  if (
    (growth === "inflecting" || growth === "strong") &&
    intensity === "elevated" &&
    fcf !== "deteriorating"
  ) {
    return "Possible productive capacity build (growth up, investment up, cash not rolling over).";
  }
  if (
    growth === "decelerating" &&
    intensity === "elevated" &&
    fcf === "deteriorating"
  ) {
    return "Possible capital-allocation warning (growth down, investment up, cash deteriorating).";
  }
  if (
    (growth === "inflecting" || growth === "strong") &&
    intensity === "down" &&
    fcf === "improving"
  ) {
    return "Possible harvest / operating-leverage phase (growth up, investment down, cash improving).";
  }
  return "Flags are relative to this name's own recent history, not a cross-sectional rank.";
}

function classifySetup(args: {
  completeness: Completeness;
  fundamental: FundamentalState;
  crowding: CrowdingBand | "unknown";
  inCorrection: boolean;
  leverage: LeverageFlag;
}): InflectionSetup {
  if (args.completeness === "insufficient" || args.fundamental === "unknown") {
    return "insufficient_data";
  }
  const extended =
    args.crowding === "extended" || args.crowding === "crowded";
  const stressed = args.leverage === "stressed";
  if (args.fundamental === "improving") {
    if (args.inCorrection && !extended && !stressed) {
      return "correction_candidate";
    }
    if (extended) return "improving_extended";
    return "improving_research";
  }
  if (args.fundamental === "deteriorating") {
    if (extended) return "avoid_late";
    if (args.inCorrection) return "falling_fundamentals";
    return "watch";
  }
  if (args.inCorrection || stressed) return "thesis_check";
  return "watch";
}

export function inflectionSetupLabel(setup: InflectionSetup): string {
  switch (setup) {
    case "improving_research":
      return "Improving — research now";
    case "improving_extended":
      return "Improving — extended";
    case "correction_candidate":
      return "Correction candidate";
    case "thesis_check":
      return "Needs thesis check";
    case "watch":
      return "Watch";
    case "falling_fundamentals":
      return "Falling fundamentals";
    case "avoid_late":
      return "Avoid / late-cycle";
    case "insufficient_data":
      return "Insufficient data";
    default: {
      const _exhaustive: never = setup;
      return _exhaustive;
    }
  }
}

export function inflectionSetupRank(
  setup: InflectionSetup | null,
): number | null {
  return setup == null ? null : SETUP_RANK[setup];
}

export function inflectionHysteresisFrom(
  snapshot: InflectionSnapshot,
): InflectionHysteresis {
  return {
    growth: snapshot.growth.flag,
    intensity: snapshot.intensity.flag,
    fcf: snapshot.fcf.flag,
    inCorrection: snapshot.correction.inCorrection,
  };
}

export function scoreInflection(input: InflectionInput): InflectionSnapshot {
  const t = input.thresholds ?? INFLECTION_THRESHOLDS;
  const previous = input.previous ?? null;
  const quarters = [...input.quarters].sort((a, b) =>
    a.periodEnd.localeCompare(b.periodEnd),
  );
  const latest = quarters[quarters.length - 1] ?? null;
  const missing: string[] = [];

  const yoyRows: number[] = [];
  if (quarters.length >= t.minQuartersForYoy) {
    for (let i = 4; i < quarters.length; i += 1) {
      const curr = quarters[i]!.revenue;
      const prevQ = quarters[i - 4]!.revenue;
      if (curr == null || prevQ == null) continue;
      const value = yoy(curr, prevQ);
      if (value != null) yoyRows.push(value);
    }
  }
  const growthCmp =
    yoyRows.length >= t.priorYoyCount + 1
      ? latestVsPriorMedian(
          yoyRows.map((value) => ({ value })),
          t.priorYoyCount,
        )
      : null;
  if (growthCmp == null) missing.push("growth_yoy");
  const growth: InflectionSnapshot["growth"] = {
    flag:
      growthCmp == null
        ? "unknown"
        : classifyGrowth(growthCmp.deltaPp, previous?.growth, t),
    latestYoyPct: growthCmp == null ? null : growthCmp.latest * 100,
    priorMedianYoyPct: growthCmp == null ? null : growthCmp.priorMedian * 100,
    deltaPp: growthCmp?.deltaPp ?? null,
  };

  const capexSeries = seriesRatios(quarters, (row) => row.capex);
  const intensityCmp = latestVsPriorMedian(capexSeries, t.priorYoyCount);
  if (intensityCmp == null) missing.push("capex_to_sales");
  const intensity: InflectionSnapshot["intensity"] = {
    flag:
      intensityCmp == null
        ? "unknown"
        : classifyIntensity(intensityCmp.deltaPp, previous?.intensity, t),
    latestCapexToSalesPct:
      intensityCmp == null ? null : intensityCmp.latest * 100,
    priorMedianCapexToSalesPct:
      intensityCmp == null ? null : intensityCmp.priorMedian * 100,
    deltaPp: intensityCmp?.deltaPp ?? null,
  };

  const fcfSeries = seriesRatios(quarters, (row) => row.freeCashFlow);
  const fcfCmp = latestVsPriorMedian(fcfSeries, t.priorYoyCount);
  if (fcfCmp == null) missing.push("fcf_to_sales");
  const fcf: InflectionSnapshot["fcf"] = {
    flag:
      fcfCmp == null ? "unknown" : classifyFcf(fcfCmp.deltaPp, previous?.fcf, t),
    latestFcfToSalesPct: fcfCmp == null ? null : fcfCmp.latest * 100,
    priorMedianFcfToSalesPct: fcfCmp == null ? null : fcfCmp.priorMedian * 100,
    deltaPp: fcfCmp?.deltaPp ?? null,
  };

  const netDebt = latest?.netDebt ?? null;
  const netDebtToMarketCap = ratio(netDebt, input.marketCap);
  if (netDebt == null) missing.push("net_debt");
  if (input.marketCap == null) missing.push("market_cap");
  const balanceSheet: InflectionSnapshot["balanceSheet"] = {
    flag: classifyLeverage(netDebtToMarketCap, t),
    netDebt,
    netDebtToMarketCap,
  };

  const latestShares = latest?.sharesDiluted ?? null;
  const yearAgo = quarters[quarters.length - 5] ?? null;
  const yearAgoShares = yearAgo?.sharesDiluted ?? null;
  const shareChange =
    latestShares != null && yearAgoShares != null && yearAgoShares !== 0
      ? yoy(latestShares, yearAgoShares)
      : null;
  if (shareChange == null) missing.push("shares_diluted");
  const dilutionFlagValue = classifyDilution(
    shareChange == null ? null : shareChange * 100,
    t,
  );
  const dilution: InflectionSnapshot["dilution"] = {
    flag: dilutionFlagValue,
    latestShares,
    yearAgoShares,
    changePct: shareChange == null ? null : shareChange * 100,
    warning:
      dilutionFlagValue === "accelerating" &&
      (intensity.flag === "elevated" ||
        balanceSheet.flag === "elevated" ||
        balanceSheet.flag === "stressed"),
  };

  const crowdingSnap =
    input.closes.length >= t.minClosesForPrice
      ? computeCrowding(input.closes)
      : null;
  if (crowdingSnap == null) missing.push("price_history");
  const crowding: InflectionSnapshot["crowding"] = {
    band: crowdingSnap?.band ?? "unknown",
    pricePercentile: crowdingSnap?.pricePercentile ?? null,
    extensionPct: crowdingSnap?.extensionPct ?? null,
  };

  const lastClose = input.closes[input.closes.length - 1] ?? null;
  const window = input.closes.slice(-252);
  const highClose = window.length > 0 ? Math.max(...window) : null;
  const drawdownFromHighPct =
    lastClose != null && highClose != null && highClose !== 0
      ? ((lastClose - highClose) / highClose) * 100
      : null;
  if (drawdownFromHighPct == null) missing.push("drawdown");
  const inCorrection =
    drawdownFromHighPct == null
      ? false
      : hysteresisOn(
          -drawdownFromHighPct,
          -t.correctionEnterPct,
          -t.correctionLeavePct,
          previous?.inCorrection ?? false,
        );
  const correction: InflectionSnapshot["correction"] = {
    inCorrection,
    drawdownFromHighPct,
    highClose,
    lastClose,
  };

  const daysSincePeriodEnd =
    latest == null ? null : utcDaysBetween(input.asOf, latest.periodEnd);
  const fundamentalsStale =
    daysSincePeriodEnd != null && daysSincePeriodEnd > t.staleAfterDays;
  const priceFreshness = resolvePriceFreshness(input);
  const stale = fundamentalsStale || priceFreshness.priceDataStale;
  if (latest == null) missing.push("fundamentals");
  if (fundamentalsStale) missing.push("freshness");
  if (priceFreshness.priceDataStale) missing.push("price_data");

  const completeness: Completeness =
    growth.flag === "unknown" && crowding.band === "unknown"
      ? "insufficient"
      : missing.length === 0 && !stale
        ? "complete"
        : "partial";

  const fundState = classifyFundamental(growth.flag);
  const setup = classifySetup({
    completeness,
    fundamental: fundState,
    crowding: crowding.band,
    inCorrection,
    leverage: balanceSheet.flag,
  });

  const bits = [triadRationale(growth.flag, intensity.flag, fcf.flag)];
  if (dilution.warning) {
    bits.push(
      `Share count is up ${dilution.changePct?.toFixed(1) ?? "?"} % vs a year ago while investment or leverage is elevated — observation, not automatically a sell.`,
    );
  }
  if (fundamentalsStale && latest) {
    bits.push(
      `Latest quarter ended ${latest.periodEnd} (${daysSincePeriodEnd}d ago) — completeness is stale, not a failed flag.`,
    );
  }
  if (priceFreshness.priceDataStale) {
    bits.push(
      `Price data through ${priceFreshness.priceDataThrough ?? "none"} is behind the session calendar — completeness is stale, not a failed flag.`,
    );
  }
  if (completeness === "insufficient") {
    bits.push(`Missing: ${missing.join(", ") || "core series"}.`);
  }

  return {
    scorerKey: INFLECTION_SCORER_KEY,
    scorerVersion: INFLECTION_SCORER_VERSION,
    asOf: input.asOf,
    calculatedAt: input.calculatedAt,
    periodEnd: latest?.periodEnd ?? null,
    ingestedAt: latest?.ingestedAt ?? null,
    completeness,
    fundamentalsStale,
    priceDataThrough: priceFreshness.priceDataThrough,
    priceDataStale: priceFreshness.priceDataStale,
    stale,
    daysSincePeriodEnd,
    missing,
    closesCount: input.closes.length,
    growth,
    intensity,
    fcf,
    balanceSheet,
    dilution,
    crowding,
    correction,
    fundamentalState: fundState,
    setup,
    rationale: bits.join(" "),
  };
}

export function inflectionTransitionCause(
  previous: InflectionSnapshot | null,
  next: InflectionSnapshot,
): TransitionCause | null {
  if (previous == null) return null;
  if (
    previous.setup === next.setup &&
    previous.fundamentalState === next.fundamentalState &&
    previous.completeness === next.completeness
  ) {
    return null;
  }
  if (
    previous.completeness !== next.completeness ||
    previous.stale !== next.stale
  ) {
    return "data_completeness";
  }
  if (previous.periodEnd !== next.periodEnd) return "new_quarter";
  if (previous.crowding.band !== next.crowding.band) return "crowding_change";
  return "price_move";
}

export function transitionCauseLabel(cause: TransitionCause): string {
  switch (cause) {
    case "new_quarter":
      return "new quarter";
    case "price_move":
      return "price move";
    case "crowding_change":
      return "crowding change";
    case "data_completeness":
      return "data completeness";
    default: {
      const _exhaustive: never = cause;
      return _exhaustive;
    }
  }
}

function nearlyEqual(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) < 1e-6;
}

function seriesInputsEqual(
  expected: InflectionSnapshot,
  actual: InflectionSnapshot,
): boolean {
  return (
    expected.periodEnd === actual.periodEnd &&
    expected.closesCount === actual.closesCount &&
    nearlyEqual(expected.correction.lastClose, actual.correction.lastClose) &&
    nearlyEqual(expected.correction.highClose, actual.correction.highClose) &&
    nearlyEqual(expected.balanceSheet.netDebt, actual.balanceSheet.netDebt) &&
    nearlyEqual(expected.growth.latestYoyPct, actual.growth.latestYoyPct) &&
    nearlyEqual(
      expected.intensity.latestCapexToSalesPct,
      actual.intensity.latestCapexToSalesPct,
    ) &&
    nearlyEqual(
      expected.fcf.latestFcfToSalesPct,
      actual.fcf.latestFcfToSalesPct,
    )
  );
}

function freshnessEqual(
  expected: InflectionSnapshot,
  actual: InflectionSnapshot,
): boolean {
  return (
    expected.stale === actual.stale &&
    expected.fundamentalsStale === actual.fundamentalsStale &&
    expected.priceDataStale === actual.priceDataStale &&
    expected.priceDataThrough === actual.priceDataThrough &&
    expected.daysSincePeriodEnd === actual.daysSincePeriodEnd &&
    expected.ingestedAt === actual.ingestedAt &&
    expected.missing.includes("freshness") ===
      actual.missing.includes("freshness") &&
    expected.missing.includes("price_data") ===
      actual.missing.includes("price_data")
  );
}

function outputsEqual(
  expected: InflectionSnapshot,
  actual: InflectionSnapshot,
): boolean {
  return (
    expected.scorerVersion === actual.scorerVersion &&
    expected.setup === actual.setup &&
    expected.fundamentalState === actual.fundamentalState &&
    expected.growth.flag === actual.growth.flag &&
    expected.intensity.flag === actual.intensity.flag &&
    expected.fcf.flag === actual.fcf.flag &&
    expected.balanceSheet.flag === actual.balanceSheet.flag &&
    expected.dilution.flag === actual.dilution.flag &&
    expected.dilution.warning === actual.dilution.warning &&
    expected.crowding.band === actual.crowding.band &&
    expected.correction.inCorrection === actual.correction.inCorrection &&
    expected.completeness === actual.completeness
  );
}

/**
 * Frozen fixtures define scorer semantics: the same inputs must always
 * produce the same v1 output. Live names may drift after new quarters or
 * prices. Classify a live-vs-fixture mismatch before treating it as a bug.
 */
export function classifyInflectionDisagreement(
  expected: InflectionSnapshot,
  actual: InflectionSnapshot,
): InflectionDisagreement {
  if (outputsEqual(expected, actual) && seriesInputsEqual(expected, actual)) {
    return "match";
  }
  if (!seriesInputsEqual(expected, actual)) return "inputs_changed";
  if (!freshnessEqual(expected, actual)) return "data_freshness";
  return "scorer_regression";
}
