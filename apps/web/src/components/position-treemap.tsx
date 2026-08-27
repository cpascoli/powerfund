"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ResponsiveContainer, Treemap } from "recharts";

import type { OpenPositionRow } from "@/lib/data/portfolio";
import { colorForPct } from "@/lib/market/heat";
import {
  MAP_COLOR_ITEMS,
  replacePortfolioSearchParam,
  type MapColorMode,
} from "@/lib/portfolio-href";

type Props = {
  positions: OpenPositionRow[];
  markLabel: string;
  initialColor: MapColorMode;
};

type Leaf = {
  name: string;
  symbol: string;
  size: number;
  value: number;
  heatUsd: number | null;
  heatPct: number | null;
  weightPctNav: number | null;
  isMarked: boolean;
};

type CellProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  symbol?: string;
  size?: number;
  heatPct?: number | null;
};

function money(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function pct(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function colorScaleFor(mode: MapColorMode): number {
  switch (mode) {
    case "day":
      return 5;
    case "week":
      return 8;
    case "pnl":
      return 20;
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export function heatForMapColor(
  row: Pick<
    OpenPositionRow,
    | "dayPnl"
    | "dayPnlPct"
    | "weekPnl"
    | "weekPnlPct"
    | "unrealizedPnl"
    | "unrealizedPnlPct"
  >,
  mode: MapColorMode,
): { usd: number | null; pct: number | null } {
  switch (mode) {
    case "day":
      return { usd: row.dayPnl, pct: row.dayPnlPct };
    case "week":
      return { usd: row.weekPnl, pct: row.weekPnlPct };
    case "pnl":
      return { usd: row.unrealizedPnl, pct: row.unrealizedPnlPct };
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

function copyFor(
  mode: MapColorMode,
  scale: number,
  markLabel: string,
): {
  blurb: string;
  down: string;
  up: string;
} {
  const size = `Tile size = position value (${markLabel.toLowerCase()})`;
  switch (mode) {
    case "day":
      return {
        blurb: `${size} · colour = session change vs prior close, saturating at ±${scale}%`,
        down: "Down",
        up: "Up",
      };
    case "week":
      return {
        blurb: `${size} · colour = 7-day change, saturating at ±${scale}%`,
        down: "Down",
        up: "Up",
      };
    case "pnl":
      return {
        blurb: `${size} · colour = unrealised P&L vs cost, saturating at ±${scale}%`,
        down: "Losing",
        up: "Winning",
      };
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

function TreemapCell({
  cell,
  colorScale,
  onHover,
  onOpen,
}: {
  cell: CellProps;
  colorScale: number;
  onHover: (symbol: string | null) => void;
  onOpen: (symbol: string) => void;
}) {
  const {
    x = 0,
    y = 0,
    width = 0,
    height = 0,
    symbol,
    heatPct = null,
  } = cell;

  if (width <= 1 || height <= 1 || !symbol) return null;

  const showLabel = width > 48 && height > 28;

  return (
    <g
      onMouseEnter={() => onHover(symbol)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onOpen(symbol)}
      style={{ cursor: "pointer" }}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={colorForPct(heatPct, colorScale)}
        stroke="var(--bg)"
        strokeWidth={2}
        rx={2}
      />
      {showLabel ? (
        <>
          <text
            x={x + 8}
            y={y + 18}
            fill="#fff"
            fontSize={13}
            fontWeight={700}
            style={{ pointerEvents: "none" }}
          >
            {symbol}
          </text>
          {height > 44 ? (
            <text
              x={x + 8}
              y={y + 34}
              fill="rgba(255,255,255,0.9)"
              fontSize={11}
              style={{ pointerEvents: "none" }}
            >
              {pct(heatPct)}
            </text>
          ) : null}
        </>
      ) : null}
    </g>
  );
}

export function PositionTreemap({ positions, markLabel, initialColor }: Props) {
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);
  const [color, setColor] = useState<MapColorMode>(initialColor);
  const colorScale = colorScaleFor(color);
  const copy = copyFor(color, colorScale, markLabel);

  const leaves = useMemo<Leaf[]>(
    () =>
      positions
        .map((row) => {
          const value = row.marketValue ?? row.costBasis;
          const heat = heatForMapColor(row, color);
          return {
            name: row.symbol,
            symbol: row.symbol,
            size: value,
            value,
            heatUsd: heat.usd,
            heatPct: heat.pct,
            weightPctNav: row.weightPctNav,
            isMarked: row.marketValue != null,
          };
        })
        .filter((leaf) => leaf.size > 0)
        .sort((a, b) => b.value - a.value),
    [positions, color],
  );

  const totalValue = leaves.reduce((sum, leaf) => sum + leaf.value, 0);
  const hover = leaves.find((leaf) => leaf.symbol === hovered) ?? null;
  const unmarked = leaves.filter((leaf) => !leaf.isMarked).length;

  return (
    <section className="panel" aria-label="Position map">
      <div className="price-panel-head">
        <div>
          <h2>Position map</h2>
          <p className="muted">{copy.blurb}</p>
        </div>
        <div className="seg" role="tablist" aria-label="Position map colour">
          {MAP_COLOR_ITEMS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={entry.id === color}
              className={entry.id === color ? "is-active" : undefined}
              onClick={() => {
                setColor(entry.id);
                replacePortfolioSearchParam("map", entry.id, "day");
              }}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <div className="treemap-meta">
        <span>
          {leaves.length} {leaves.length === 1 ? "position" : "positions"} ·{" "}
          {money(totalValue)} at risk
          {unmarked > 0 ? ` · ${unmarked} shown at cost (no mark)` : ""}
        </span>
        <span className="treemap-legend" aria-hidden="true">
          <span className="legend-down">{copy.down}</span>
          <span className="legend-bar" />
          <span className="legend-up">{copy.up}</span>
        </span>
        {hover ? (
          <span>
            {hover.symbol}: {money(hover.value)}
            {hover.weightPctNav != null
              ? ` · ${hover.weightPctNav.toFixed(1)}% NAV`
              : ""}{" "}
            · {money(hover.heatUsd)} ({pct(hover.heatPct)})
          </span>
        ) : (
          <span className="muted">Hover a tile · click to open dossier</span>
        )}
      </div>

      {leaves.length === 0 ? (
        <p className="empty">
          No open positions to map yet. Confirm a fill and it will appear here.
        </p>
      ) : (
        <div className="treemap-chart is-compact">
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={leaves}
              dataKey="size"
              stroke="var(--bg)"
              isAnimationActive={false}
              content={(cellProps) => (
                <TreemapCell
                  cell={cellProps as CellProps}
                  colorScale={colorScale}
                  onHover={setHovered}
                  onOpen={(symbol) => router.push(`/explore/${symbol}`)}
                />
              )}
            />
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
