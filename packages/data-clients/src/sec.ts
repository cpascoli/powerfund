import type { QuarterlyFundamentals } from "./types";

const SEC_UA = "PowerFund/0.1 (research ingest; contact: local-dev)";

type SecTicker = {
  cik_str: number;
  ticker: string;
  title: string;
};

type SecFactUnit = {
  start?: string;
  end?: string;
  val?: number;
  form?: string;
  fp?: string;
  fy?: number;
  frame?: string;
  filed?: string;
};

type SecCompanyFacts = {
  facts?: {
    "us-gaap"?: Record<
      string,
      {
        units?: Record<string, SecFactUnit[]>;
      }
    >;
  };
};

let tickerCache: Map<string, number> | null = null;

async function secFetch(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": SEC_UA,
    },
  });
}

async function loadTickerCiks(): Promise<Map<string, number>> {
  if (tickerCache) return tickerCache;

  const response = await secFetch(
    "https://www.sec.gov/files/company_tickers.json",
  );
  if (!response.ok) {
    throw new Error(
      `SEC tickers: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as Record<string, SecTicker>;
  const map = new Map<string, number>();
  for (const row of Object.values(payload)) {
    map.set(row.ticker.toUpperCase(), row.cik_str);
  }
  tickerCache = map;
  return map;
}

function collectUnits(
  facts: SecCompanyFacts,
  keys: string[],
  unitName: string,
): SecFactUnit[] {
  const gaap = facts.facts?.["us-gaap"] ?? {};
  const out: SecFactUnit[] = [];
  for (const key of keys) {
    const units = gaap[key]?.units?.[unitName];
    if (units?.length) out.push(...units);
  }
  return out;
}

/**
 * Currency the filer actually reports in.
 *
 * Reading `units.USD` unconditionally and stamping the row `USD` was wrong for
 * anyone who does not report in dollars — Nebius files `Revenues` in RUB — and
 * silently produced figures a thousand times off with a label saying otherwise.
 * Pick the unit carrying the most revenue facts and use it for every monetary
 * concept, so one row is never assembled from two currencies.
 */
function reportingCurrency(facts: SecCompanyFacts, revenueKeys: string[]): string {
  const gaap = facts.facts?.["us-gaap"] ?? {};
  const counts = new Map<string, number>();
  for (const key of revenueKeys) {
    for (const [unit, values] of Object.entries(gaap[key]?.units ?? {})) {
      if (unit === "shares" || unit.includes("/")) continue;
      counts.set(unit, (counts.get(unit) ?? 0) + (values?.length ?? 0));
    }
  }
  let best = "USD";
  let bestCount = 0;
  for (const [unit, count] of counts) {
    // Prefer USD on a tie: a convenience translation is still dollars.
    if (count > bestCount || (count === bestCount && unit === "USD")) {
      best = unit;
      bestCount = count;
    }
  }
  return best;
}

function daySpan(start: string | undefined, end: string | undefined): number | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / (1000 * 60 * 60 * 24);
}

function isInstant(unit: SecFactUnit): boolean {
  return !unit.start;
}

function isQuarterlyDuration(unit: SecFactUnit): boolean {
  if (isInstant(unit)) return false;
  if (unit.frame && /YTD$/i.test(unit.frame)) return false;
  if (unit.frame && /CY\d{4}Q[1-4]$/i.test(unit.frame)) return true;
  if (unit.fp === "FY") return false;
  const span = daySpan(unit.start, unit.end);
  // Single quarter-ish window; reject obvious YTD/annual spans.
  return span != null && span >= 60 && span <= 120;
}

function isAnnualDuration(unit: SecFactUnit): boolean {
  if (isInstant(unit)) return false;
  if (unit.fp === "FY") return true;
  if (unit.frame && /^CY\d{4}$/i.test(unit.frame)) return true;
  const span = daySpan(unit.start, unit.end);
  return span != null && span > 300 && span < 400;
}

function latestFiled(
  units: Array<SecFactUnit | undefined>,
): string | null {
  let latest: string | null = null;
  for (const unit of units) {
    const filed = unit?.filed;
    if (!filed) continue;
    if (latest == null || filed > latest) latest = filed;
  }
  return latest;
}

function preferUnit(next: SecFactUnit, prev: SecFactUnit | undefined): boolean {
  if (!prev) return true;
  const score = (row: SecFactUnit) => {
    let s = 0;
    if (row.frame && /CY\d{4}Q[1-4]$/i.test(row.frame)) s += 4;
    if (row.fp && row.fp !== "FY") s += 2;
    if (row.form === "10-Q") s += 1;
    if (row.filed) s += row.filed.localeCompare("1970-01-01") * 0.000001;
    return s;
  };
  return score(next) >= score(prev);
}

function latestByPeriod(
  units: SecFactUnit[],
  kind: "duration" | "instant",
): Map<string, SecFactUnit> {
  const byEnd = new Map<string, SecFactUnit>();
  for (const unit of units) {
    if (!unit.end || unit.val == null) continue;
    if (unit.form && !["10-Q", "10-K", "20-F", "40-F"].includes(unit.form)) {
      continue;
    }

    if (kind === "instant") {
      // Balance-sheet / shares outstanding style: end date only, or instant frames.
      const instantFrame = Boolean(unit.frame && /I$/i.test(unit.frame));
      if (unit.start && !instantFrame) continue;
    } else if (!isQuarterlyDuration(unit) && !isAnnualDuration(unit)) {
      continue;
    }

    const existing = byEnd.get(unit.end);
    if (preferUnit(unit, existing)) {
      byEnd.set(unit.end, unit);
    }
  }
  return byEnd;
}


/**
 * Every acceptable unit for a period, not just the preferred one.
 *
 * companyfacts reports a period again in each later filing that shows it as a
 * comparative, and `latestByPeriod` kept only the newest of those. That is the
 * right answer for "what is this number now" and the wrong one for "when could
 * we have known it": NVIDIA's July 2025 quarter came back stamped 26 Aug 2026,
 * the date of the FY27 Q2 10-Q, rather than the Aug 2025 filing that first
 * disclosed it. Keeping every unit is what lets the ingest emit a real vintage
 * per filing.
 */
function unitsByPeriod(
  units: SecFactUnit[],
  kind: "duration" | "instant",
): Map<string, SecFactUnit[]> {
  const byEnd = new Map<string, SecFactUnit[]>();
  for (const unit of units) {
    if (!unit.end || unit.val == null) continue;
    if (unit.form && !["10-Q", "10-K", "20-F", "40-F"].includes(unit.form)) {
      continue;
    }
    if (kind === "instant") {
      const instantFrame = Boolean(unit.frame && /I$/i.test(unit.frame));
      if (unit.start && !instantFrame) continue;
    } else if (!isQuarterlyDuration(unit) && !isAnnualDuration(unit)) {
      continue;
    }
    const list = byEnd.get(unit.end) ?? [];
    list.push(unit);
    byEnd.set(unit.end, list);
  }
  return byEnd;
}

/** Best unit for a period that had already been filed on `filed`. */
function unitAsOf(
  units: SecFactUnit[] | undefined,
  filed: string,
): SecFactUnit | undefined {
  let best: SecFactUnit | undefined;
  for (const unit of units ?? []) {
    if (!unit.filed || unit.filed > filed) continue;
    if (best == null) {
      best = unit;
      continue;
    }
    if (unit.filed > (best.filed ?? "")) {
      best = unit;
    } else if (unit.filed === best.filed && preferUnit(unit, best)) {
      best = unit;
    }
  }
  return best;
}

/** Filing dates that disclosed something about this quarter, oldest first. */
function filingDatesFor(
  ...groups: Array<SecFactUnit[] | undefined>
): string[] {
  const dates = new Set<string>();
  for (const group of groups) {
    for (const unit of group ?? []) {
      if (unit.filed) dates.add(unit.filed);
    }
  }
  return [...dates].sort();
}


type PeriodUnits = {
  revenue?: SecFactUnit;
  ocf?: SecFactUnit;
  capex?: SecFactUnit;
  longDebt?: SecFactUnit;
  shortDebt?: SecFactUnit;
  cash?: SecFactUnit;
  sharesDiluted?: SecFactUnit;
  sharesOutstanding?: SecFactUnit;
};

function measureFingerprint(row: QuarterlyFundamentals): string {
  return [
    row.revenue,
    row.freeCashFlow,
    row.capex,
    row.netDebt,
    row.sharesDiluted,
  ]
    .map((value) => (value == null ? "" : String(value)))
    .join("|");
}

function buildRow(
  periodEnd: string,
  filedAt: string | null,
  cik: number,
  currency: string,
  units: PeriodUnits,
): QuarterlyFundamentals | null {
  if (units.revenue == null && units.ocf == null && units.capex == null) {
    return null;
  }
  const fp =
    units.revenue?.fp ?? units.ocf?.fp ?? units.capex?.fp ?? null;
  const ocfVal = units.ocf?.val ?? null;
  const capexVal = units.capex?.val ?? null;
  const capexSpend = capexVal == null ? null : Math.abs(capexVal);
  const fcf = ocfVal != null && capexSpend != null ? ocfVal - capexSpend : null;
  const debt = (units.longDebt?.val ?? 0) + (units.shortDebt?.val ?? 0);
  const cashVal = units.cash?.val;
  // Never zero-fill a missing debt leg — that understates leverage (DATA-8).
  const hasDebtPoint = units.longDebt != null || units.shortDebt != null;
  const netDebt = hasDebtPoint && cashVal != null ? debt - cashVal : null;

  return {
    periodEnd,
    fiscalPeriod: fp,
    filedAt,
    revenue: units.revenue?.val ?? null,
    freeCashFlow: fcf,
    capex: capexSpend,
    netDebt,
    sharesDiluted:
      units.sharesDiluted?.val ?? units.sharesOutstanding?.val ?? null,
    currency,
    source: "sec",
    raw: {
      cik,
      filed: filedAt,
      revenue: units.revenue ?? null,
      ocf: units.ocf ?? null,
      capex: units.capex ?? null,
    },
  };
}

/**
 * Quarterly fundamentals from SEC companyfacts (no API key).
 * Best for US-listed issuers; foreign ADRs vary in us-gaap coverage.
 */
export async function fetchSecQuarterlyFundamentals(
  symbol: string,
): Promise<QuarterlyFundamentals[]> {
  const tickers = await loadTickerCiks();
  const cik = tickers.get(symbol.trim().toUpperCase());
  if (cik == null) {
    throw new Error(`SEC: no CIK for ${symbol}`);
  }

  const cik10 = String(cik).padStart(10, "0");
  const response = await secFetch(
    `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10}.json`,
  );
  if (!response.ok) {
    throw new Error(
      `SEC companyfacts ${symbol}: ${response.status} ${response.statusText}`,
    );
  }

  const facts = (await response.json()) as SecCompanyFacts;

  const REVENUE_KEYS = [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
  ];
  const currency = reportingCurrency(facts, REVENUE_KEYS);

  const revenue = unitsByPeriod(
    collectUnits(facts, REVENUE_KEYS, currency),
    "duration",
  );
  const ocf = unitsByPeriod(
    collectUnits(
      facts,
      ["NetCashProvidedByUsedInOperatingActivities"],
      currency,
    ),
    "duration",
  );
  const capex = unitsByPeriod(
    collectUnits(
      facts,
      [
        "PaymentsToAcquireProductiveAssets",
        "PaymentsToAcquirePropertyPlantAndEquipment",
      ],
      currency,
    ),
    "duration",
  );
  const longDebt = unitsByPeriod(
    collectUnits(facts, ["LongTermDebt", "LongTermDebtNoncurrent"], currency),
    "instant",
  );
  const shortDebt = unitsByPeriod(
    collectUnits(
      facts,
      ["ShortTermBorrowings", "LongTermDebtCurrent", "CommercialPaper"],
      currency,
    ),
    "instant",
  );
  const cash = unitsByPeriod(
    collectUnits(
      facts,
      [
        "CashAndCashEquivalentsAtCarryingValue",
        "CashCashEquivalentsAndShortTermInvestments",
      ],
      currency,
    ),
    "instant",
  );
  const sharesDiluted = unitsByPeriod(
    collectUnits(
      facts,
      ["WeightedAverageNumberOfDilutedSharesOutstanding"],
      "shares",
    ),
    "duration",
  );
  const sharesOutstanding = unitsByPeriod(
    collectUnits(
      facts,
      [
        "CommonStockSharesOutstanding",
        "EntityCommonStockSharesOutstanding",
      ],
      "shares",
    ),
    "instant",
  );

  const periodEnds = new Set<string>([
    ...revenue.keys(),
    ...ocf.keys(),
    ...capex.keys(),
  ]);

  const rows: QuarterlyFundamentals[] = [];
  for (const periodEnd of periodEnds) {
    // One observation per filing that disclosed this quarter: the original
    // 10-Q, then any later filing that restated it. Anything the ingest can see
    // at date D is exactly what the market could see at date D.
    const filings = filingDatesFor(
      revenue.get(periodEnd),
      ocf.get(periodEnd),
      capex.get(periodEnd),
    );

    // No filing dates at all — emit the single best view and let the caller
    // estimate when it became knowable.
    if (filings.length === 0) {
      const row = buildRow(periodEnd, null, cik, currency, {
        revenue: unitAsOf(revenue.get(periodEnd), "9999-12-31"),
        ocf: unitAsOf(ocf.get(periodEnd), "9999-12-31"),
        capex: unitAsOf(capex.get(periodEnd), "9999-12-31"),
        longDebt: unitAsOf(longDebt.get(periodEnd), "9999-12-31"),
        shortDebt: unitAsOf(shortDebt.get(periodEnd), "9999-12-31"),
        cash: unitAsOf(cash.get(periodEnd), "9999-12-31"),
        sharesDiluted: unitAsOf(sharesDiluted.get(periodEnd), "9999-12-31"),
        sharesOutstanding: unitAsOf(sharesOutstanding.get(periodEnd), "9999-12-31"),
      });
      if (row != null) rows.push(row);
      continue;
    }

    let previous: string | null = null;
    for (const filed of filings) {
      const row = buildRow(periodEnd, filed, cik, currency, {
        revenue: unitAsOf(revenue.get(periodEnd), filed),
        ocf: unitAsOf(ocf.get(periodEnd), filed),
        capex: unitAsOf(capex.get(periodEnd), filed),
        longDebt: unitAsOf(longDebt.get(periodEnd), filed),
        shortDebt: unitAsOf(shortDebt.get(periodEnd), filed),
        cash: unitAsOf(cash.get(periodEnd), filed),
        sharesDiluted: unitAsOf(sharesDiluted.get(periodEnd), filed),
        sharesOutstanding: unitAsOf(sharesOutstanding.get(periodEnd), filed),
      });
      if (row == null) continue;
      // A later filing that merely repeats the same numbers is a comparative,
      // not a restatement. Only changes are vintages.
      const fingerprint = measureFingerprint(row);
      if (fingerprint === previous) continue;
      previous = fingerprint;
      rows.push(row);
    }
  }

  return rows
    .filter((row) => row.fiscalPeriod !== "FY")
    .sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1));
}
