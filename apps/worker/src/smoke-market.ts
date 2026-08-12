import {
  fetchDailyBars,
  fetchQuarterlyFundamentals,
  fetchYahooMarketCap,
} from "@powerfund/data-clients";

const symbol =
  process.argv.find(
    (arg, index) => index >= 2 && arg !== "--" && !arg.startsWith("-"),
  ) ?? "NVDA";

const { bars, source: barSource } = await fetchDailyBars({
  symbol,
  startDate: "2026-01-01",
  tiingoApiKey: process.env.TIINGO_API_KEY,
});

let mcapBillions: number | null = null;
try {
  const mcap = await fetchYahooMarketCap(symbol);
  mcapBillions = mcap ? Math.round(mcap.marketCap / 1e9) : null;
} catch {
  mcapBillions = null;
}

const { rows, source: fundSource } = await fetchQuarterlyFundamentals({
  symbol,
});

console.log(
  JSON.stringify(
    {
      symbol,
      barSource,
      bars: bars.length,
      lastBar: bars.at(-1)?.date,
      lastClose: bars.at(-1)?.close,
      mcapBillions,
      fundSource,
      quarters: rows.length,
      latestPeriod: rows[0]?.periodEnd ?? null,
      latestRevenue: rows[0]?.revenue ?? null,
      latestFcf: rows[0]?.freeCashFlow ?? null,
      latestCapex: rows[0]?.capex ?? null,
      latestNetDebt: rows[0]?.netDebt ?? null,
    },
    null,
    2,
  ),
);
