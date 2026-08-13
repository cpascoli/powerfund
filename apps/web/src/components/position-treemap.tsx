"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ResponsiveContainer, Treemap } from "recharts";

import type { OpenPositionRow } from "@/lib/data/portfolio";
import { colorForPct } from "@/lib/market/heat";

/**
 * Percentage at which the colour saturates. Fixed rather than fitted to the
 * current book, so a tile's colour means the same thing from one day to the next.
 */
const PNL_COLOR_SCALE = 20;

type Props = {
  positions: OpenPositionRow[];
  markLabel: string;
};

type Leaf = {
  name: string;
  symbol: string;
  size: number;
  value: number;
  pnl: number | null;
  pnlPct: number | null;
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
  pnlPct?: number | null;
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

function TreemapCell({
  cell,
  onHover,
  onOpen,
}: {
  cell: CellProps;
  onHover: (symbol: string | null) => void;
  onOpen: (symbol: string) => void;
}) {
  const { x = 0, y = 0, width = 0, height = 0, symbol, pnlPct = null } = cell;

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
        fill={colorForPct(pnlPct, PNL_COLOR_SCALE)}
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
              {pct(pnlPct)}
            </text>
          ) : null}
        </>
      ) : null}
    </g>
  );
}

export function PositionTreemap({ positions, markLabel }: Props) {
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);

  const leaves = useMemo<Leaf[]>(
    () =>
      positions
        // An unmarked position still has to appear, so fall back to cost.
        .map((row) => {
          const value = row.marketValue ?? row.costBasis;
          return {
            name: row.symbol,
            symbol: row.symbol,
            size: value,
            value,
            pnl: row.unrealizedPnl,
            pnlPct: row.unrealizedPnlPct,
            weightPctNav: row.weightPctNav,
            isMarked: row.marketValue != null,
          };
        })
        .filter((leaf) => leaf.size > 0)
        .sort((a, b) => b.value - a.value),
    [positions],
  );

  const totalValue = leaves.reduce((sum, leaf) => sum + leaf.value, 0);
  const hover = leaves.find((leaf) => leaf.symbol === hovered) ?? null;
  const unmarked = leaves.filter((leaf) => !leaf.isMarked).length;

  return (
    <section className="panel" aria-label="Position map">
      <div className="price-panel-head">
        <div>
          <h2>Position map</h2>
          <p className="muted">
            Tile size = position value ({markLabel.toLowerCase()}) · colour =
            unrealised P&amp;L, saturating at ±{PNL_COLOR_SCALE}%
          </p>
        </div>
      </div>

      <div className="treemap-meta">
        <span>
          {leaves.length} {leaves.length === 1 ? "position" : "positions"} ·{" "}
          {money(totalValue)} at risk
          {unmarked > 0 ? ` · ${unmarked} shown at cost (no mark)` : ""}
        </span>
        <span className="treemap-legend" aria-hidden="true">
          <span className="legend-down">Losing</span>
          <span className="legend-bar" />
          <span className="legend-up">Winning</span>
        </span>
        {hover ? (
          <span>
            {hover.symbol}: {money(hover.value)}
            {hover.weightPctNav != null
              ? ` · ${hover.weightPctNav.toFixed(1)}% NAV`
              : ""}{" "}
            · {money(hover.pnl)} ({pct(hover.pnlPct)})
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
