"use client";

import { useState, type ReactNode } from "react";

import {
  VIZ_TAB_ITEMS,
  replacePortfolioSearchParam,
  type VizTab,
} from "@/lib/portfolio-href";

type PortfolioVizTabsProps = {
  initialTab: VizTab;
  panels: Record<VizTab, ReactNode>;
};

export function PortfolioVizTabs({
  initialTab,
  panels,
}: PortfolioVizTabsProps) {
  const [tab, setTab] = useState<VizTab>(initialTab);

  return (
    <section className="stat-tabs" aria-label="Portfolio charts">
      <nav className="tab-nav is-compact" aria-label="Chart views">
        {VIZ_TAB_ITEMS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={entry.id === tab}
            className={entry.id === tab ? "is-active" : undefined}
            onClick={() => {
              setTab(entry.id);
              replacePortfolioSearchParam("viz", entry.id, "map");
            }}
          >
            {entry.label}
          </button>
        ))}
      </nav>
      {(() => {
        switch (tab) {
          case "map":
          case "nav":
            return panels[tab];
          default: {
            const _exhaustive: never = tab;
            return _exhaustive;
          }
        }
      })()}
    </section>
  );
}
