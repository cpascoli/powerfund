"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ResponsiveContainer, Treemap } from "recharts";

import type { WorkbenchNameNode } from "@/lib/data/workbench";
import { colorForPct } from "@/lib/market/heat";
import {
  RETURN_WINDOWS,
  type ReturnWindow,
} from "@/lib/market/returns";

type Props = {
  names: WorkbenchNameNode[];
  themes: Array<{ slug: string; name: string }>;
  initialTheme?: string;
  initialWindow?: ReturnWindow;
};

type LeafNode = {
  name: string;
  symbol: string;
  size: number;
  marketCap: number;
  returnPct: number | null;
  themeName: string;
};

type ThemeNode = {
  name: string;
  children: LeafNode[];
};

type TreemapContentProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  depth?: number;
  symbol?: string;
  returnPct?: number | null;
  marketCap?: number;
  themeName?: string;
};

function formatMcap(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toLocaleString()}`;
}

function formatPct(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function scaleForWindow(window: ReturnWindow): number {
  switch (window) {
    case "1d":
      return 5;
    case "1w":
      return 8;
    case "1m":
      return 15;
    case "3m":
      return 25;
    case "6m":
      return 35;
    case "ytd":
      return 40;
    case "1y":
      return 50;
    case "2y":
      return 80;
    default: {
      const _exhaustive: never = window;
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
  cell: TreemapContentProps;
  colorScale: number;
  onHover: (leaf: LeafNode | null) => void;
  onOpen: (symbol: string) => void;
}) {
  const {
    x = 0,
    y = 0,
    width = 0,
    height = 0,
    name = "",
    symbol,
    returnPct = null,
    marketCap = 0,
    themeName = "",
  } = cell;

  if (width <= 1 || height <= 1) return null;

  const isLeaf = Boolean(symbol);
  if (!isLeaf) {
    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill="var(--bg-elevated)"
          stroke="var(--line)"
          strokeWidth={2}
        />
        {width > 70 && height > 24 ? (
          <text
            x={x + 8}
            y={y + 18}
            fill="var(--muted)"
            fontSize={12}
            fontWeight={650}
          >
            {name}
          </text>
        ) : null}
      </g>
    );
  }

  const fill = colorForPct(returnPct, colorScale);
  const showLabel = width > 48 && height > 28;

  return (
    <g
      onMouseEnter={() =>
        onHover({
          name,
          symbol: symbol!,
          size: marketCap,
          marketCap,
          returnPct,
          themeName,
        })
      }
      onMouseLeave={() => onHover(null)}
      onClick={() => onOpen(symbol!)}
      style={{ cursor: "pointer" }}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
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
              {formatPct(returnPct)}
            </text>
          ) : null}
        </>
      ) : null}
    </g>
  );
}

export function MarketCapTreemap({
  names,
  themes,
  initialTheme = "all",
  initialWindow = "3m",
}: Props) {
  const router = useRouter();
  const [themeSlug, setThemeSlug] = useState(initialTheme);
  const [windowKey, setWindowKey] = useState<ReturnWindow>(initialWindow);
  const [hover, setHover] = useState<LeafNode | null>(null);

  const filtered = useMemo(() => {
    if (themeSlug === "all") return names;
    return names.filter((name) => name.themeSlug === themeSlug);
  }, [names, themeSlug]);

  const treeData = useMemo(() => {
    const leavesFor = (rows: WorkbenchNameNode[]): LeafNode[] =>
      rows
        .map((row) => ({
          name: row.symbol,
          symbol: row.symbol,
          size: row.marketCap,
          marketCap: row.marketCap,
          returnPct: row.returns[windowKey] ?? null,
          themeName: row.themeName,
        }))
        .sort((a, b) => b.marketCap - a.marketCap);

    if (themeSlug !== "all") {
      return leavesFor(filtered);
    }

    const byTheme = new Map<string, WorkbenchNameNode[]>();
    for (const row of filtered) {
      const list = byTheme.get(row.themeName) ?? [];
      list.push(row);
      byTheme.set(row.themeName, list);
    }

    const grouped: ThemeNode[] = [...byTheme.entries()]
      .map(([themeName, rows]) => ({
        name: themeName,
        children: leavesFor(rows),
      }))
      .filter((node) => node.children.length > 0)
      .sort(
        (a, b) =>
          b.children.reduce((sum, child) => sum + child.marketCap, 0) -
          a.children.reduce((sum, child) => sum + child.marketCap, 0),
      );

    return grouped;
  }, [filtered, themeSlug, windowKey]);

  const totalCap = filtered.reduce((sum, row) => sum + row.marketCap, 0);
  const colorScale = scaleForWindow(windowKey);
  const windowLabel =
    RETURN_WINDOWS.find((row) => row.key === windowKey)?.label ?? windowKey;

  return (
    <section className="panel" aria-label="Market cap treemap">
      <div className="price-panel-head">
        <div>
          <h2>Market map</h2>
          <p className="muted">
            Tile size = market cap · color = {windowLabel} return
          </p>
        </div>
        <div className="workbench-controls">
          <label>
            Universe
            <select
              value={themeSlug}
              onChange={(event) => setThemeSlug(event.target.value)}
            >
              <option value="all">All themes</option>
              {themes.map((theme) => (
                <option key={theme.slug} value={theme.slug}>
                  {theme.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Performance
            <select
              value={windowKey}
              onChange={(event) =>
                setWindowKey(event.target.value as ReturnWindow)
              }
            >
              {RETURN_WINDOWS.map((window) => (
                <option key={window.key} value={window.key}>
                  {window.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="treemap-meta">
        <span>
          {filtered.length} names · {formatMcap(totalCap)} combined
        </span>
        <span className="treemap-legend" aria-hidden="true">
          <span className="legend-down">Down</span>
          <span className="legend-bar" />
          <span className="legend-up">Up</span>
        </span>
        {hover ? (
          <span>
            {hover.symbol}: {formatMcap(hover.marketCap)} ·{" "}
            {formatPct(hover.returnPct)}
          </span>
        ) : (
          <span className="muted">Hover a tile · click to open dossier</span>
        )}
      </div>

      {treeData.length === 0 ? (
        <p className="empty">No market-cap data for this filter yet.</p>
      ) : (
        <div className="treemap-chart">
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={treeData}
              dataKey="size"
              stroke="var(--bg)"
              isAnimationActive={false}
              content={(cellProps) => (
                <TreemapCell
                  cell={cellProps as TreemapContentProps}
                  colorScale={colorScale}
                  onHover={setHover}
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
