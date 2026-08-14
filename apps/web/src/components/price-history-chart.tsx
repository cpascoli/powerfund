"use client";

import {
  Area,
  AreaChart,
  Brush,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { PricePoint } from "@/lib/market/returns";

type PriceHistoryChartProps = {
  symbol: string;
  points: PricePoint[];
  liveLast?: boolean;
};

function formatAxisDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return date.toLocaleDateString(undefined, {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function formatTooltipDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function PriceHistoryChart({
  symbol,
  points,
  liveLast = false,
}: PriceHistoryChartProps) {
  if (points.length === 0) {
    return (
      <section className="panel price-panel" aria-label={`${symbol} price chart`}>
        <h2>Price</h2>
        <p className="muted">No daily bars yet. Run ingest to load history.</p>
      </section>
    );
  }

  const brushStart = Math.max(0, points.length - 126);

  return (
    <section className="panel price-panel" aria-label={`${symbol} price chart`}>
      <div className="price-panel-head">
        <h2>Price</h2>
        <p className="muted">
          {liveLast
            ? "Daily adjusted close · last point is delayed last sale · drag the brush to zoom"
            : "Daily adjusted close · drag the brush to zoom"}
        </p>
      </div>
      <div className="price-chart">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={points}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="var(--line)"
              strokeDasharray="3 6"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickFormatter={formatAxisDate}
              minTickGap={48}
              tick={{ fill: "var(--muted)", fontSize: 12 }}
              axisLine={{ stroke: "var(--line)" }}
              tickLine={false}
            />
            <YAxis
              domain={["auto", "auto"]}
              width={56}
              tickFormatter={(value: number) =>
                value >= 1000 ? value.toFixed(0) : value.toFixed(2)
              }
              tick={{ fill: "var(--muted)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--line)",
                borderRadius: 8,
                color: "var(--ink)",
              }}
              labelFormatter={(label) => formatTooltipDate(String(label))}
              formatter={(value, _name, item) => {
                const date =
                  item && typeof item === "object" && "payload" in item
                    ? (item.payload as PricePoint | undefined)?.date
                    : undefined;
                const lastDate = points[points.length - 1]?.date;
                const isLive = liveLast && date != null && date === lastDate;
                return [
                  typeof value === "number" ? `$${value.toFixed(2)}` : "—",
                  isLive ? "Last" : "Close",
                ];
              }}
            />
            <Area
              type="monotone"
              dataKey="close"
              stroke="var(--accent)"
              strokeWidth={2}
              fill="url(#priceFill)"
              isAnimationActive={false}
              dot={false}
              activeDot={{ r: 4, fill: "var(--accent)" }}
            />
            <Brush
              dataKey="date"
              height={28}
              stroke="var(--accent)"
              fill="var(--accent-soft)"
              tickFormatter={formatAxisDate}
              startIndex={brushStart}
              endIndex={points.length - 1}
              travellerWidth={10}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
