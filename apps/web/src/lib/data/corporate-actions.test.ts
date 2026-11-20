import { describe, expect, it } from "vitest";
import { splitsFromYahooEvents } from "@powerfund/data-clients";
import {
  accumulateLedgerFlows,
  assessBookIntegrity,
  buildPerformancePoints,
  contributionFromLedger,
  decisionHorizonReturns,
  detectPriceRebase,
  evaluateTrigger,
  fillBasisMismatches,
  fillSessionDate,
  impliedSplit,
  ledgerOnCurrentBasis,
  maxDrawdownPct,
  parseReviewTrigger,
  planDetectedSplit,
  priceBasisNote,
  reconstructSnapshots,
  splitFactorAfter,
  stampPriceBasis,
  unitizedDeployedIndex,
  unitsOnCurrentBasis,
  type KnownSplit,
  type LedgerEntry,
  type StockSplit,
} from "@powerfund/domain";

import { integrityPayload } from "./price-freshness";
import { withBookIntegrity, type PortfolioBook } from "./portfolio";

/**
 * The real case. Sandisk split eight-for-one, effective after the close on
 * 19 November 2026. We held 2.28 shares bought on 1 October for $3,972.81.
 * The vendor restated every earlier close; the book kept 2.28 shares.
 */
const SNDK = "sndk";
const SNDK_SPLIT: StockSplit = {
  instrumentId: SNDK,
  effectiveDate: "2026-11-20",
  numerator: 8,
  denominator: 1,
};

const SESSIONS = ["2026-10-01", "2026-11-18", "2026-11-19", "2026-11-20"];

/** What a share actually traded at. The last session is post-split. */
const UNADJUSTED: Record<string, number> = {
  "2026-10-01": 1787.69,
  "2026-11-18": 776.22,
  "2026-11-19": 755.16,
  "2026-11-20": 96.0,
};

/** What the vendor serves once the split has taken effect: everything on the new basis. */
const ADJUSTED: Record<string, number> = {
  "2026-10-01": 1787.69 / 8,
  "2026-11-18": 776.22 / 8,
  "2026-11-19": 94.395,
  "2026-11-20": 96.0,
};

const DEPOSIT: LedgerEntry = {
  occurredAt: "2026-08-12T15:00:00Z",
  kind: "deposit",
  instrumentId: null,
  quantity: null,
  cashDelta: 250_000,
  basisDelta: null,
};

const SNDK_BUY: LedgerEntry = {
  occurredAt: "2026-10-01T21:00:00Z",
  kind: "buy",
  instrumentId: SNDK,
  quantity: 2.28,
  cashDelta: -3972.81,
  basisDelta: 3972.81,
};

function closesFrom(series: Record<string, number>, id = SNDK) {
  return new Map(
    Object.entries(series).map(([date, close]) => [date, new Map([[id, close]])]),
  );
}

function rebuild(
  entries: LedgerEntry[],
  splits: StockSplit[],
  series: Record<string, number>,
) {
  return reconstructSnapshots({
    entries: ledgerOnCurrentBasis(entries, splits, fillSessionDate),
    sessions: Object.keys(series),
    closes: closesFrom(series),
  });
}

function deployedIndex(entries: LedgerEntry[], snapshots: ReturnType<typeof rebuild>) {
  const flows = accumulateLedgerFlows(
    entries.map((row) => ({
      occurredAt: row.occurredAt,
      kind: row.kind,
      cashDelta: row.cashDelta,
    })),
  );
  return unitizedDeployedIndex(
    buildPerformancePoints(
      snapshots.map((row) => ({
        date: row.session,
        nav: row.nav,
        invested: row.invested,
        positionsValue: row.positionsValue,
      })),
      flows,
    ),
  );
}

describe("split factor", () => {
  it("restates an 8-for-1 forward split and leaves the money alone", () => {
    const factor = splitFactorAfter([SNDK_SPLIT], SNDK, "2026-10-01");
    expect(factor).toBe(8);
    expect(unitsOnCurrentBasis(2.28, factor)).toBe(18.24);
    // The invariant in the spec: no change in value from the split alone.
    expect(2.28 * 755.16).toBeCloseTo(1721.7648, 10);
    expect(18.24 * 94.395).toBeCloseTo(1721.7648, 10);
    // Average cost: 3,972.81 / 18.24, an eighth of 1,742.4605...
    expect(3972.81 / 18.24).toBeCloseTo(1742.4605263 / 8, 6);
  });

  it("restates a reverse split", () => {
    const reverse: StockSplit = { ...SNDK_SPLIT, numerator: 1, denominator: 10 };
    const factor = splitFactorAfter([reverse], SNDK, "2026-10-01");
    expect(factor).toBe(0.1);
    expect(unitsOnCurrentBasis(40, factor)).toBe(4);
  });

  it("compounds consecutive splits, counting only those after the session", () => {
    const splits: StockSplit[] = [
      SNDK_SPLIT,
      { instrumentId: SNDK, effectiveDate: "2027-03-01", numerator: 3, denominator: 2 },
      { instrumentId: "other", effectiveDate: "2026-12-01", numerator: 2, denominator: 1 },
    ];
    expect(splitFactorAfter(splits, SNDK, "2026-10-01")).toBe(12);
    expect(splitFactorAfter(splits, SNDK, "2026-11-20")).toBe(1.5);
    expect(splitFactorAfter(splits, SNDK, "2027-03-01")).toBe(1);
    expect(splitFactorAfter(splits, null, "2026-10-01")).toBe(1);
  });

  it("returns exactly 1 for a split and its inverse", () => {
    const splits: StockSplit[] = [
      { instrumentId: SNDK, effectiveDate: "2026-11-20", numerator: 3, denominator: 2 },
      { instrumentId: SNDK, effectiveDate: "2026-12-20", numerator: 2, denominator: 3 },
    ];
    expect(splitFactorAfter(splits, SNDK, "2026-10-01")).toBe(1);
  });

  it("puts a fill on the effective date on the new basis and the evening before on the old", () => {
    // 21:00 New York on the 19th is already the 20th in UTC. The session is the
    // New York day, so this fill is pre-split.
    const eveningBefore = "2026-11-20T02:00:00Z";
    const openOfTheDay = "2026-11-20T14:30:00Z";
    const [before, after] = ledgerOnCurrentBasis(
      [
        { ...SNDK_BUY, occurredAt: eveningBefore, quantity: 1, price: 760 },
        { ...SNDK_BUY, occurredAt: openOfTheDay, quantity: 1, price: 95 },
      ],
      [SNDK_SPLIT],
      fillSessionDate,
    );
    expect(before?.quantity).toBe(8);
    expect(before?.price).toBe(95);
    expect(after?.quantity).toBe(1);
    expect(after?.price).toBe(95);
  });

  it("keeps fractional units to the 8 decimals the book stores", () => {
    const third: StockSplit = { ...SNDK_SPLIT, numerator: 1, denominator: 3 };
    const [row] = ledgerOnCurrentBasis(
      [{ ...SNDK_BUY, quantity: 1 }],
      [third],
      fillSessionDate,
    );
    expect(row?.quantity).toBe(0.33333333);
  });

  it("does not touch cash, cost basis or the caller's rows", () => {
    const [row] = ledgerOnCurrentBasis([SNDK_BUY], [SNDK_SPLIT], fillSessionDate);
    expect(row?.cashDelta).toBe(-3972.81);
    expect(row?.basisDelta).toBe(3972.81);
    expect(SNDK_BUY.quantity).toBe(2.28);
  });
});

describe("NAV across a split", () => {
  it("reproduces the defect: vendor-adjusted prices against unadjusted quantities", () => {
    const broken = rebuild([DEPOSIT, SNDK_BUY], [], ADJUSTED);
    // 2.28 old shares at the new $94.395 close: $215.22 for a $1,721.76 holding.
    expect(broken.at(-2)?.positionsValue).toBe(215.22);
    // And not only from the split date: the whole history is rebuilt, so the
    // fill day is wrong too.
    expect(broken[0]?.positionsValue).toBeCloseTo((2.28 * 1787.69) / 8, 1);
  });

  it("is continuous once quantities are on the price basis", () => {
    const fixed = rebuild([DEPOSIT, SNDK_BUY], [SNDK_SPLIT], ADJUSTED);
    const day19 = fixed.find((row) => row.session === "2026-11-19");
    expect(day19?.positions[0]?.quantity).toBe(18.24);
    expect(day19?.positionsValue).toBe(1721.76);
    expect(day19?.invested).toBe(3972.81);
    expect(day19?.cash).toBe(250_000 - 3972.81);
    expect(day19?.nav).toBe(250_000 - 3972.81 + 1721.76);
  });

  it("matches the pre-split history exactly, session for session", () => {
    // Before the split the truth was point-in-time quantities at unadjusted
    // prices. After it, restated quantities at adjusted prices must say the
    // same thing about every one of those sessions.
    const preSplitSessions = SESSIONS.slice(0, 3);
    const pointInTime = reconstructSnapshots({
      entries: [DEPOSIT, SNDK_BUY],
      sessions: preSplitSessions,
      closes: closesFrom(UNADJUSTED),
    });
    const restated = rebuild([DEPOSIT, SNDK_BUY], [SNDK_SPLIT], ADJUSTED).slice(0, 3);
    expect(restated.map((row) => row.nav)).toEqual(pointInTime.map((row) => row.nav));
    expect(restated.map((row) => row.invested)).toEqual(
      pointInTime.map((row) => row.invested),
    );
  });

  it("leaves returns and drawdown spanning the split unchanged", () => {
    const entries = [DEPOSIT, SNDK_BUY];
    const fixed = deployedIndex(entries, rebuild(entries, [SNDK_SPLIT], ADJUSTED));
    const broken = deployedIndex(entries, rebuild(entries, [], ADJUSTED));

    // The economic path: 1,787.69 -> 776.22 -> 755.16 -> 768.00 (96 x 8).
    const economic = [1, 776.22 / 1787.69, 755.16 / 1787.69, 768 / 1787.69];
    fixed.forEach((value, i) => expect(value).toBeCloseTo(economic[i] ?? 0, 3));
    expect(maxDrawdownPct(fixed)).toBeCloseTo((1 - 755.16 / 1787.69) * 100, 1);

    // The last step is a real +1.7% day, not a split artefact in either series
    // — but the broken one cannot be told from the truth by its returns alone,
    // because it is wrong by the same factor on every day. Its *level* is what
    // gives it away, which is why the check below is on stored values.
    expect(broken.at(-1)).toBeCloseTo(fixed.at(-1) ?? 0, 3);
    expect(rebuild(entries, [], ADJUSTED)[0]?.positionsValue).toBeLessThan(
      rebuild(entries, [SNDK_SPLIT], ADJUSTED)[0]?.positionsValue ?? 0,
    );
  });

  it("handles purchases and a partial disposal on both sides of the split", () => {
    const entries: LedgerEntry[] = [
      DEPOSIT,
      SNDK_BUY,
      {
        occurredAt: "2026-11-18T20:00:00Z",
        kind: "sell",
        instrumentId: SNDK,
        quantity: 0.28,
        cashDelta: 217.34,
        basisDelta: -487.89,
      },
      {
        // On the effective date: 4 new-basis shares.
        occurredAt: "2026-11-20T15:00:00Z",
        kind: "buy",
        instrumentId: SNDK,
        quantity: 4,
        cashDelta: -384,
        basisDelta: 384,
      },
    ];
    const fixed = rebuild(entries, [SNDK_SPLIT], ADJUSTED);
    // (2.28 - 0.28) x 8 = 16 before the split; + 4 after.
    expect(fixed[2]?.positions[0]?.quantity).toBe(16);
    expect(fixed[3]?.positions[0]?.quantity).toBe(20);
    expect(fixed[3]?.positionsValue).toBe(1920);
    expect(fixed[3]?.invested).toBe(3972.81 - 487.89 + 384);
  });

  it("does not adjust when the vendor's prices are still unadjusted and no split is applied", () => {
    // The day before the vendor restates: old quantities, old prices. Correct
    // as it stands, and it must stay that way — applying the split to the
    // ledger here would be the double adjustment.
    const consistent = rebuild([DEPOSIT, SNDK_BUY], [], UNADJUSTED).slice(0, 3);
    expect(consistent[2]?.positionsValue).toBe(1721.76);
    const doubled = rebuild([DEPOSIT, SNDK_BUY], [SNDK_SPLIT], UNADJUSTED).slice(0, 3);
    expect(doubled[2]?.positionsValue).toBe(13774.12);
  });
});

describe("share-basis mismatch", () => {
  const range = (close: number) => ({ low: close * 0.98, high: close * 1.02, close });

  it("flags a fill that is a split-sized multiple of its session's prices", () => {
    // Vendor restated, split not registered: $1,742.46 against a $223 session.
    const [hit] = fillBasisMismatches([
      { symbol: "SNDK", session: "2026-10-01", price: 1742.46, bar: range(223.46) },
    ]);
    expect(hit?.symbol).toBe("SNDK");
    expect(hit?.ratio).toBeGreaterThan(7);
    expect(hit?.implied).toEqual({ numerator: 8, denominator: 1 });
  });

  it("is quiet once the fill price is restated by the applied split", () => {
    expect(
      fillBasisMismatches([
        { symbol: "SNDK", session: "2026-10-01", price: 1742.46 / 8, bar: range(223.46) },
      ]),
    ).toEqual([]);
  });

  it("flags the opposite error: a split applied while prices are still unadjusted", () => {
    const [hit] = fillBasisMismatches([
      { symbol: "SNDK", session: "2026-10-01", price: 1742.46 / 8, bar: range(1787.69) },
    ]);
    expect(hit?.ratio).toBeLessThan(0.15);
    expect(hit?.implied).toEqual({ numerator: 1, denominator: 8 });
  });

  it("ignores an ordinary fill and a fill with no bar", () => {
    expect(
      fillBasisMismatches([
        { symbol: "VRT", session: "2026-08-12", price: 296.54, bar: range(301) },
        { symbol: "NVT", session: "2026-08-12", price: 100, bar: null },
      ]),
    ).toEqual([]);
  });

  it("snaps a measured ratio to a real split or to nothing", () => {
    expect(impliedSplit(8)).toEqual({ numerator: 8, denominator: 1 });
    expect(impliedSplit(2.001)).toEqual({ numerator: 2, denominator: 1 });
    expect(impliedSplit(0.1)).toEqual({ numerator: 1, denominator: 10 });
    expect(impliedSplit(1.5)).toEqual({ numerator: 3, denominator: 2 });
    expect(impliedSplit(1.37)).toBeNull();
    expect(impliedSplit(Number.NaN)).toBeNull();
  });

  it("reads the vendor's rebase as an 8-for-1", () => {
    const stored = Object.entries(UNADJUSTED)
      .slice(0, 3)
      .map(([date, close]) => ({ date, close }));
    const fetched = Object.entries(ADJUSTED)
      .slice(0, 3)
      .map(([date, close]) => ({ date, close }));
    const rebase = detectPriceRebase(stored, fetched);
    expect(rebase.looksLikeSplit).toBe(true);
    expect(impliedSplit(rebase.ratio ?? Number.NaN)).toEqual({
      numerator: 8,
      denominator: 1,
    });
  });
});

describe("registering a detected split", () => {
  const detected = {
    numerator: 8,
    denominator: 1,
    effectiveDate: "2026-11-20",
    source: "price_rebase" as const,
  };
  const known = (overrides: Partial<KnownSplit>): KnownSplit => ({
    id: "a",
    status: "pending",
    effectiveDate: "2026-11-20",
    numerator: 8,
    denominator: 1,
    source: "price_rebase",
    ...overrides,
  });

  it("opens a pending row the first time", () => {
    expect(planDetectedSplit([], detected)).toEqual({ action: "insert" });
  });

  it("does nothing when the same split is seen again", () => {
    expect(planDetectedSplit([known({})], detected).action).toBe("ignore");
    expect(planDetectedSplit([known({ status: "applied" })], detected).action).toBe(
      "ignore",
    );
    // The operator said it was not a split. Ingest does not get to disagree
    // every night.
    expect(planDetectedSplit([known({ status: "rejected" })], detected).action).toBe(
      "ignore",
    );
  });

  it("treats the vendor event for an applied split as the same event, a few days apart", () => {
    expect(
      planDetectedSplit([known({ status: "applied", source: "manual" })], {
        ...detected,
        effectiveDate: "2026-11-23",
        source: "vendor_event",
      }).action,
    ).toBe("ignore");
  });

  it("lets a vendor event correct the date a rebase guessed, while still pending", () => {
    expect(
      planDetectedSplit([known({ effectiveDate: "2026-11-19" })], {
        ...detected,
        source: "vendor_event",
      }),
    ).toEqual({ action: "update", id: "a" });
  });

  it("registers a genuinely later split of the same ratio", () => {
    expect(
      planDetectedSplit([known({ status: "applied" })], {
        ...detected,
        effectiveDate: "2028-06-01",
      }),
    ).toEqual({ action: "insert" });
  });

  it("keeps only well-formed vendor events", () => {
    expect(
      splitsFromYahooEvents([
        { date: new Date("2026-11-20T14:30:00Z"), numerator: 8, denominator: 1 },
        { date: new Date("2026-11-20T14:30:00Z"), numerator: 1, denominator: 1 },
        { date: null, numerator: 2, denominator: 1 },
        { date: new Date("2025-01-02T14:30:00Z"), numerator: 1.5, denominator: 1 },
      ]),
    ).toEqual([{ date: "2026-11-20", numerator: 8, denominator: 1, source: "yahoo" }]);
    expect(splitsFromYahooEvents(undefined)).toEqual([]);
  });
});

describe("attribution and calibration across a split", () => {
  it("attributes the economic P&L, not the split, to the ticker", () => {
    const ledger = [SNDK_BUY].map((row) => ({
      occurredAt: row.occurredAt,
      kind: row.kind,
      instrumentId: row.instrumentId,
      quantity: row.quantity,
      cashDelta: row.cashDelta,
      realizedPnl: null,
    }));
    const report = (splits: StockSplit[]) =>
      contributionFromLedger({
        from: "2026-10-01",
        to: "2026-11-20",
        tradingDays: SESSIONS,
        ledger: ledgerOnCurrentBasis(ledger, splits, fillSessionDate),
        instruments: [
          { id: SNDK, symbol: "SNDK", themeSlug: "memory", themeName: "Memory" },
        ],
        bars: Object.entries(ADJUSTED).map(([date, close]) => ({
          instrumentId: SNDK,
          date,
          close,
        })),
      });

    const fixed = report([SNDK_SPLIT]).tickers[0];
    // 18.24 x 96 = 1,751.04 of value for 3,972.81 paid.
    expect(fixed?.endMarketValueUsd).toBe(1751.04);
    expect(fixed?.pnlUsd).toBe(Number((1751.04 - 3972.81).toFixed(2)));

    const broken = report([]).tickers[0];
    expect(broken?.endMarketValueUsd).toBe(218.88);
  });

  it("grades a decision on the same return whichever basis the series is on", () => {
    // Calibration reads closes only, from one series. A decision on 1 October
    // graded at 30 days spans no split here, but the series it reads has been
    // restated under it — and the return must not notice.
    const bars = (series: Record<string, number>) =>
      Object.entries(series).map(([date, close]) => ({ date, close }));
    const spy = SESSIONS.map((date, i) => ({ date, close: 600 + i }));
    const grade = (series: Record<string, number>) =>
      decisionHorizonReturns({
        anchorSession: "2026-10-01",
        asOf: "2026-11-19",
        tickerBars: bars(series).slice(0, 3),
        spyBars: spy,
      })[0];
    expect(grade(ADJUSTED)?.tickerReturn).toBeCloseTo(
      grade(UNADJUSTED)?.tickerReturn ?? 0,
      10,
    );
    // And across the split itself, on the restated series, there is no step.
    const across = decisionHorizonReturns({
      anchorSession: "2026-11-19",
      asOf: "2026-11-20",
      tickerBars: bars(ADJUSTED),
      spyBars: spy,
    })[0];
    expect(across?.tickerReturn).toBeCloseTo(96 / 94.395 - 1, 10);
  });
});

describe("price triggers across a split", () => {
  const asOf = new Date("2026-11-21T12:00:00Z");
  const market = { lastPrice: { SNDK: 94.395 }, returnPct: {} };
  const buyBelow = parseReviewTrigger({
    type: "condition",
    metric: "price",
    symbol: "SNDK",
    operator: "lte",
    value: 700,
  });

  it("would fire on the nominal price alone — the failure to prevent", () => {
    expect(evaluateTrigger(buyBelow, asOf, market).satisfied).toBe(true);
  });

  it("does not fire once the threshold is restated: $755 a share is not below $700", () => {
    const result = evaluateTrigger(buyBelow, asOf, market, { priceBasisFactor: 8 });
    expect(result.satisfied).toBe(false);
    expect(result.reason).toContain("restated to 87.5");
  });

  it("still fires when the stock really has fallen through the restated level", () => {
    expect(
      evaluateTrigger(
        buyBelow,
        asOf,
        { lastPrice: { SNDK: 85 }, returnPct: {} },
        { priceBasisFactor: 8 },
      ).satisfied,
    ).toBe(true);
  });

  it("restates an upside threshold too", () => {
    const above = parseReviewTrigger({ ...buyBelow, operator: "gte", value: 2000 });
    expect(
      evaluateTrigger(above, asOf, { lastPrice: { SNDK: 260 }, returnPct: {} }, {
        priceBasisFactor: 8,
      }).satisfied,
    ).toBe(true);
    expect(
      evaluateTrigger(above, asOf, { lastPrice: { SNDK: 240 }, returnPct: {} }, {
        priceBasisFactor: 8,
      }).satisfied,
    ).toBe(false);
  });

  it("leaves a return condition alone: both closes come from one series", () => {
    const drop = parseReviewTrigger({
      type: "condition",
      metric: "price_return_pct",
      symbol: "SNDK",
      operator: "lte",
      value: -20,
      lookback_days: 5,
    });
    const observed = { lastPrice: {}, returnPct: { "SNDK:5": -25 } };
    expect(evaluateTrigger(drop, asOf, observed, { priceBasisFactor: 8 }).satisfied).toBe(
      true,
    );
  });

  it("refuses to evaluate on a nonsensical factor rather than guess", () => {
    const result = evaluateTrigger(buyBelow, asOf, market, { priceBasisFactor: 0 });
    expect(result.satisfied).toBe(false);
    expect(result.evaluable).toBe(false);
  });

  it("stamps the basis day on a price threshold as it is written, and only then", () => {
    const stamped = stampPriceBasis(buyBelow, "2026-11-21");
    expect(stamped).toMatchObject({ price_basis_date: "2026-11-21" });
    // Round-trips through storage.
    expect(parseReviewTrigger(stamped)).toMatchObject({
      price_basis_date: "2026-11-21",
    });
    // A threshold written after the split is already on the new basis.
    expect(splitFactorAfter([SNDK_SPLIT], SNDK, "2026-11-21")).toBe(1);
    expect(splitFactorAfter([SNDK_SPLIT], SNDK, "2026-11-19")).toBe(8);
    // Not a price: no basis to record.
    const scheduled = parseReviewTrigger({ type: "scheduled", at: "2026-12-01T00:00:00Z" });
    expect(stampPriceBasis(scheduled, "2026-11-21")).toEqual(scheduled);
  });
});

describe("research written before a split", () => {
  it("hands the reader the factor instead of rewriting the text", () => {
    const note = priceBasisNote([SNDK_SPLIT], SNDK, "2026-10-01", "Dossier version 4");
    expect(note).toContain("Dossier version 4 was written on 2026-10-01");
    expect(note).toContain("8-for-1 effective 2026-11-20");
    expect(note).toContain("divide by 8");
  });

  it("says nothing for text written on or after the split, or for another name", () => {
    expect(priceBasisNote([SNDK_SPLIT], SNDK, "2026-11-20", "x")).toBeNull();
    expect(priceBasisNote([SNDK_SPLIT], "other", "2026-10-01", "x")).toBeNull();
    expect(priceBasisNote([], SNDK, "2026-10-01", "x")).toBeNull();
  });

  it("gives the direction for a reverse split and compounds two", () => {
    const reverse: StockSplit = { ...SNDK_SPLIT, numerator: 1, denominator: 10 };
    expect(priceBasisNote([reverse], SNDK, "2026-10-01", "x")).toContain("multiply by 10");
    const later: StockSplit = { ...SNDK_SPLIT, effectiveDate: "2027-03-01", numerator: 3, denominator: 2 };
    const note = priceBasisNote([SNDK_SPLIT, later], SNDK, "2026-10-01", "x");
    expect(note).toContain("divide by 12");
    expect(note).toContain("then 3-for-2 effective 2027-03-01");
  });
});

describe("book integrity", () => {
  // 03:00 UTC on Friday the 20th: Thursday's session has closed.
  const asOf = "2026-11-20T03:00:00Z";
  const current = [
    { symbol: "SNDK", through: "2026-11-19" },
    { symbol: "MRCY", through: "2026-11-19" },
  ];

  it("is clean when every holding has the session and nothing is pending", () => {
    const result = assessBookIntegrity({
      benchmarkThrough: "2026-11-19",
      holdings: current,
      pendingCorporateActions: [],
      basisMismatches: [],
      asOf,
    });
    expect(result.stale).toBe(false);
    expect(result.provisional).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it("is stale and provisional when some holdings lack the session, and names them", () => {
    // 19 November 2026 as it happened: SPY and half the book had the close,
    // six names did not, and price_data_stale said false.
    const result = assessBookIntegrity({
      benchmarkThrough: "2026-11-19",
      holdings: [
        { symbol: "SNDK", through: "2026-11-19" },
        { symbol: "VRT", through: "2026-11-18" },
        { symbol: "CEG", through: "2026-11-18" },
        { symbol: "NEW", through: null },
      ],
      pendingCorporateActions: [],
      basisMismatches: [],
      asOf,
    });
    expect(result.holdingsThrough).toBe("2026-11-19");
    expect(result.stale).toBe(true);
    expect(result.provisional).toBe(true);
    expect(result.missingCloses.map((row) => row.symbol)).toEqual(["CEG", "NEW", "VRT"]);
    expect(result.warnings[0]).toContain("VRT (last 2026-11-18)");

    const payload = integrityPayload(result.holdingsThrough, result, asOf);
    expect(payload.price_data_through).toBe("2026-11-19");
    expect(payload.price_data_stale).toBe(true);
    expect(payload).toMatchObject({ valuation_provisional: true });
  });

  it("is provisional for a pending split on a held name, fresh prices or not", () => {
    const result = assessBookIntegrity({
      benchmarkThrough: "2026-11-19",
      holdings: current,
      pendingCorporateActions: [
        {
          symbol: "SNDK",
          effectiveDate: "2026-11-20",
          numerator: 8,
          denominator: 1,
          source: "price_rebase",
          held: true,
        },
      ],
      basisMismatches: [],
      asOf,
    });
    expect(result.stale).toBe(false);
    expect(result.provisional).toBe(true);
    expect(result.warnings[0]).toContain("SNDK 8-for-1 split");
  });

  it("reports a pending split on an unheld name without doubting NAV", () => {
    const result = assessBookIntegrity({
      benchmarkThrough: "2026-11-19",
      holdings: current,
      pendingCorporateActions: [
        {
          symbol: "APH",
          effectiveDate: "2026-11-20",
          numerator: 2,
          denominator: 1,
          source: "vendor_event",
          held: false,
        },
      ],
      basisMismatches: [],
      asOf,
    });
    expect(result.provisional).toBe(false);
    expect(result.warnings).toHaveLength(1);
  });

  it("is provisional on a basis mismatch even with no split registered at all", () => {
    // SNDK before this work: nothing pending, nothing stale, and wrong.
    const result = assessBookIntegrity({
      benchmarkThrough: "2026-11-19",
      holdings: current,
      pendingCorporateActions: [],
      basisMismatches: fillBasisMismatches([
        {
          symbol: "SNDK",
          session: "2026-10-01",
          price: 1742.46,
          bar: { low: 219, high: 226, close: 223.46 },
        },
      ]),
      asOf,
    });
    expect(result.provisional).toBe(true);
    expect(result.warnings[0]).toContain("unreconciled 8-for-1 split");
  });

  it("reports provisional when the check could not run, and nothing when it was not asked", () => {
    expect(integrityPayload("2026-11-19", null, asOf)).toMatchObject({
      valuation_provisional: true,
    });
    expect(integrityPayload("2026-11-19", undefined, asOf)).toEqual({
      price_data_through: "2026-11-19",
      price_data_stale: false,
    });
  });

  it("leads the book's flags and removes a false all-clear", () => {
    const book = {
      flags: [{ code: "all_clear", severity: "ok", label: "Mandate checks clear vs NAV" }],
    } as unknown as PortfolioBook;
    const flagged = withBookIntegrity(
      book,
      assessBookIntegrity({
        benchmarkThrough: "2026-11-19",
        holdings: current,
        pendingCorporateActions: [
          {
            symbol: "SNDK",
            effectiveDate: "2026-11-20",
            numerator: 8,
            denominator: 1,
            source: "price_rebase",
            held: true,
          },
        ],
        basisMismatches: [],
        asOf,
      }),
    );
    expect(flagged.flags.map((flag) => flag.code)).toEqual(["corporate_action_pending"]);

    const clean = withBookIntegrity(
      book,
      assessBookIntegrity({
        benchmarkThrough: "2026-11-19",
        holdings: current,
        pendingCorporateActions: [],
        basisMismatches: [],
        asOf,
      }),
    );
    expect(clean.flags.map((flag) => flag.code)).toEqual(["all_clear"]);
  });
});
