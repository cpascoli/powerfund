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
  unitName: "USD" | "shares",
): SecFactUnit[] {
  const gaap = facts.facts?.["us-gaap"] ?? {};
  const out: SecFactUnit[] = [];
  for (const key of keys) {
    const units = gaap[key]?.units?.[unitName];
    if (units?.length) out.push(...units);
  }
  return out;
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

  const revenue = latestByPeriod(
    collectUnits(
      facts,
      [
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "Revenues",
        "SalesRevenueNet",
        "RevenueFromContractWithCustomerIncludingAssessedTax",
      ],
      "USD",
    ),
    "duration",
  );
  const ocf = latestByPeriod(
    collectUnits(
      facts,
      ["NetCashProvidedByUsedInOperatingActivities"],
      "USD",
    ),
    "duration",
  );
  const capex = latestByPeriod(
    collectUnits(
      facts,
      [
        "PaymentsToAcquireProductiveAssets",
        "PaymentsToAcquirePropertyPlantAndEquipment",
      ],
      "USD",
    ),
    "duration",
  );
  const longDebt = latestByPeriod(
    collectUnits(facts, ["LongTermDebt", "LongTermDebtNoncurrent"], "USD"),
    "instant",
  );
  const shortDebt = latestByPeriod(
    collectUnits(
      facts,
      ["ShortTermBorrowings", "LongTermDebtCurrent", "CommercialPaper"],
      "USD",
    ),
    "instant",
  );
  const cash = latestByPeriod(
    collectUnits(
      facts,
      [
        "CashAndCashEquivalentsAtCarryingValue",
        "CashCashEquivalentsAndShortTermInvestments",
      ],
      "USD",
    ),
    "instant",
  );
  const sharesDiluted = latestByPeriod(
    collectUnits(
      facts,
      ["WeightedAverageNumberOfDilutedSharesOutstanding"],
      "shares",
    ),
    "duration",
  );
  const sharesOutstanding = latestByPeriod(
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
    const revenueUnit = revenue.get(periodEnd);
    const ocfUnit = ocf.get(periodEnd);
    const capexUnit = capex.get(periodEnd);

    // Prefer quarter rows for the dossier series; keep FY only if no Q tag.
    const fp = revenueUnit?.fp ?? ocfUnit?.fp ?? capexUnit?.fp ?? null;
    const ocfVal = ocfUnit?.val ?? null;
    const capexVal = capexUnit?.val ?? null;
    const capexSpend = capexVal == null ? null : Math.abs(capexVal);
    const fcf =
      ocfVal != null && capexSpend != null ? ocfVal - capexSpend : null;
    const debt =
      (longDebt.get(periodEnd)?.val ?? 0) + (shortDebt.get(periodEnd)?.val ?? 0);
    const cashVal = cash.get(periodEnd)?.val;
    const hasDebtPoint =
      longDebt.has(periodEnd) || shortDebt.has(periodEnd);
    const netDebt =
      hasDebtPoint && cashVal != null ? debt - cashVal : null;

    rows.push({
      periodEnd,
      fiscalPeriod: fp,
      revenue: revenueUnit?.val ?? null,
      freeCashFlow: fcf,
      capex: capexSpend,
      netDebt,
      sharesDiluted:
        sharesDiluted.get(periodEnd)?.val ??
        sharesOutstanding.get(periodEnd)?.val ??
        null,
      currency: "USD",
      source: "sec",
      raw: {
        cik,
        revenue: revenueUnit ?? null,
        ocf: ocfUnit ?? null,
        capex: capexUnit ?? null,
      },
    });
  }

  return rows
    .filter((row) => row.fiscalPeriod !== "FY")
    .sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1));
}
