"use client";

import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { NavChartPoint, NavChartView } from "@/lib/data/nav-series";

type NavHistoryChartProps = {
  points: NavChartPoint[];
  view: NavChartView;
  tabs?: ReactNode;
};

function formatAxisDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
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

function formatAxisUsd(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `$${Math.round(value / 1_000)}k`;
  }
  return `$${value.toFixed(0)}`;
}

function money(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function pct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(2)}%`;
}

function isNavChartPoint(value: unknown): value is NavChartPoint {
  return (
    typeof value === "object" &&
    value != null &&
    "date" in value &&
    "nav" in value
  );
}

function NavTooltip({
  view,
  label,
  payload,
}: {
  view: NavChartView;
  label?: string | number;
  payload?: ReadonlyArray<{ payload?: unknown }>;
}) {
  const raw = payload?.[0]?.payload;
  const point = isNavChartPoint(raw) ? raw : null;
  if (point == null || label == null) return null;

  const rows: Array<{ label: string; value: string; tone?: string }> = [];
  switch (view) {
    case "nav":
      rows.push({ label: "NAV", value: money(point.nav) });
      rows.push({ label: "Cash", value: money(point.cash) });
      rows.push({ label: "Invested", value: money(point.invested) });
      break;
    case "change":
      rows.push({
        label: "Daily P&L",
        value: money(point.dailyPnl),
        tone:
          point.dailyPnl == null
            ? undefined
            : point.dailyPnl > 0
              ? "is-up"
              : point.dailyPnl < 0
                ? "is-down"
                : undefined,
      });
      rows.push({ label: "Session return", value: pct(point.dailyReturn) });
      rows.push({ label: "NAV", value: money(point.nav) });
      break;
    case "pnl":
      rows.push({
        label: "Cumulative P&L",
        value: money(point.cumulativePnl),
        tone:
          point.cumulativePnl == null
            ? undefined
            : point.cumulativePnl > 0
              ? "is-up"
              : point.cumulativePnl < 0
                ? "is-down"
                : undefined,
      });
      rows.push({ label: "Daily P&L", value: money(point.dailyPnl) });
      rows.push({ label: "NAV", value: money(point.nav) });
      break;
    default: {
      const _exhaustive: never = view;
      return _exhaustive;
    }
  }

  return (
    <div className="chart-tooltip">
      <p>{formatTooltipDate(String(label))}</p>
      {rows.map((row) => (
        <p key={row.label}>
          <span className="muted">{row.label}</span>{" "}
          <strong className={row.tone}>{row.value}</strong>
        </p>
      ))}
    </div>
  );
}

function chartCopy(view: NavChartView): { title: string; blurb: string } {
  switch (view) {
    case "nav":
      return {
        title: "NAV",
        blurb: "Official weekday EOD marks · cash + positions",
      };
    case "change":
      return {
        title: "Daily change",
        blurb: "Dollar P&L that session · deposits stripped out",
      };
    case "pnl":
      return {
        title: "P&L",
        blurb: "Cumulative economic P&L since the first snapshot",
      };
    default: {
      const _exhaustive: never = view;
      return _exhaustive;
    }
  }
}

export function NavHistoryChart({ points, view, tabs }: NavHistoryChartProps) {
  const copy = chartCopy(view);
  const head = (
    <div className="price-panel-head">
      <div>
        <h2>{copy.title}</h2>
        <p className="muted">{copy.blurb}</p>
      </div>
      {tabs}
    </div>
  );

  if (points.length === 0) {
    return (
      <section className="panel price-panel" aria-label="NAV history">
        {head}
        <p className="empty">
          No NAV snapshots yet. The weekday 22:30 UTC job fills this series.
        </p>
      </section>
    );
  }

  const axis = {
    tick: { fill: "var(--muted)", fontSize: 12 },
    axisLine: { stroke: "var(--line)" },
  };

  const cartesian = (
    <>
      <CartesianGrid
        stroke="var(--line)"
        strokeDasharray="3 6"
        vertical={false}
      />
      <XAxis
        dataKey="date"
        tickFormatter={formatAxisDate}
        minTickGap={28}
        tick={axis.tick}
        axisLine={axis.axisLine}
        tickLine={false}
      />
      <YAxis
        domain={["auto", "auto"]}
        width={56}
        tickFormatter={formatAxisUsd}
        tick={axis.tick}
        axisLine={false}
        tickLine={false}
      />
      <Tooltip
        content={(props) => (
          <NavTooltip
            view={view}
            label={props.label}
            payload={props.payload}
          />
        )}
      />
    </>
  );

  let plot: ReactNode;
  switch (view) {
    case "nav":
      plot = (
        <AreaChart
          data={points}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="navFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {cartesian}
          <Area
            type="monotone"
            dataKey="nav"
            stroke="var(--accent)"
            strokeWidth={2}
            fill="url(#navFill)"
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4, fill: "var(--accent)" }}
          />
        </AreaChart>
      );
      break;
    case "change":
      plot = (
        <BarChart
          data={points}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          {cartesian}
          <Bar dataKey="dailyPnl" isAnimationActive={false} maxBarSize={28}>
            {points.map((point) => (
              <Cell
                key={point.date}
                fill={
                  point.dailyPnl == null || point.dailyPnl >= 0
                    ? "var(--accent)"
                    : "var(--danger)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      );
      break;
    case "pnl":
      plot = (
        <AreaChart
          data={points}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {cartesian}
          <Area
            type="monotone"
            dataKey="cumulativePnl"
            stroke="var(--accent)"
            strokeWidth={2}
            fill="url(#pnlFill)"
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4, fill: "var(--accent)" }}
          />
        </AreaChart>
      );
      break;
    default: {
      const _exhaustive: never = view;
      plot = _exhaustive;
    }
  }

  return (
    <section className="panel price-panel" aria-label="NAV history">
      {head}
      <div className="price-chart is-nav">
        <ResponsiveContainer width="100%" height="100%">
          {plot}
        </ResponsiveContainer>
      </div>
    </section>
  );
}
