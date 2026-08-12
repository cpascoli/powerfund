import type { DailyBar } from "./types";

function parseCsvLine(line: string): string[] {
  return line.split(",").map((part) => part.trim());
}

function num(value: string | undefined): number | null {
  if (value == null || value === "" || value === "null") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Free EOD OHLCV CSV from Stooq (no API key).
 * US symbols use the `.us` suffix (e.g. nvda.us).
 */
export async function fetchStooqDailyBars(args: {
  symbol: string;
  startDate: string;
  endDate?: string;
}): Promise<DailyBar[]> {
  const stooqSymbol = `${args.symbol.trim().toLowerCase()}.us`;
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`;
  const response = await fetch(url, {
    headers: {
      Accept: "text/csv,text/plain,*/*",
      "User-Agent": "PowerFund/0.1 (research ingest)",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Stooq ${args.symbol}: ${response.status} ${response.statusText}`,
    );
  }

  const text = await response.text();
  if (text.startsWith("<!DOCTYPE") || text.includes("<html")) {
    throw new Error(
      `Stooq ${args.symbol}: received HTML challenge instead of CSV`,
    );
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return [];
  }

  const header = parseCsvLine(lines[0]!).map((h) => h.toLowerCase());
  const dateIdx = header.indexOf("date");
  const openIdx = header.indexOf("open");
  const highIdx = header.indexOf("high");
  const lowIdx = header.indexOf("low");
  const closeIdx = header.indexOf("close");
  const volumeIdx = header.indexOf("volume");
  if (dateIdx < 0 || closeIdx < 0) {
    throw new Error(`Stooq ${args.symbol}: unexpected CSV header`);
  }

  const endDate = args.endDate ?? new Date().toISOString().slice(0, 10);
  const bars: DailyBar[] = [];

  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const date = cols[dateIdx];
    if (!date || date < args.startDate || date > endDate) continue;
    const close = num(cols[closeIdx]);
    if (close == null) continue;
    bars.push({
      date,
      open: num(cols[openIdx]),
      high: num(cols[highIdx]),
      low: num(cols[lowIdx]),
      close,
      adjClose: close,
      volume: num(cols[volumeIdx]),
      source: "stooq",
    });
  }

  return bars.sort((a, b) => (a.date < b.date ? -1 : 1));
}
