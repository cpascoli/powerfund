import type { DailyBar } from "./types";

type TiingoPriceRow = {
  date: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  adjClose?: number;
  volume?: number;
};

function toDateOnly(value: string): string {
  return value.slice(0, 10);
}

export async function fetchTiingoDailyBars(args: {
  symbol: string;
  apiKey: string;
  startDate: string;
  endDate?: string;
}): Promise<DailyBar[]> {
  const params = new URLSearchParams({
    startDate: args.startDate,
    format: "json",
    resampleFreq: "daily",
  });
  if (args.endDate) {
    params.set("endDate", args.endDate);
  }

  const url = `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(args.symbol.toLowerCase())}/prices?${params}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Token ${args.apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Tiingo ${args.symbol}: ${response.status} ${response.statusText} — ${body.slice(0, 200)}`,
    );
  }

  const rows = (await response.json()) as TiingoPriceRow[];
  return rows.map((row) => ({
    date: toDateOnly(row.date),
    open: row.open ?? null,
    high: row.high ?? null,
    low: row.low ?? null,
    close: row.close ?? null,
    adjClose: row.adjClose ?? row.close ?? null,
    volume: row.volume ?? null,
    source: "tiingo",
  }));
}
