"use client";

import { useState, type ReactNode } from "react";

import {
  STAT_TAB_ITEMS,
  replacePortfolioSearchParam,
  type StatsTab,
} from "@/lib/portfolio-href";

type PortfolioStatTabsProps = {
  initialTab: StatsTab;
  panels: Record<StatsTab, ReactNode>;
};

export function PortfolioStatTabs({
  initialTab,
  panels,
}: PortfolioStatTabsProps) {
  const [tab, setTab] = useState<StatsTab>(initialTab);

  return (
    <section className="stat-tabs" aria-label="Portfolio stats">
      <nav className="tab-nav is-compact" aria-label="Stat groups">
        {STAT_TAB_ITEMS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={entry.id === tab}
            className={entry.id === tab ? "is-active" : undefined}
            onClick={() => {
              setTab(entry.id);
              replacePortfolioSearchParam("stats", entry.id, "book");
            }}
          >
            {entry.label}
          </button>
        ))}
      </nav>
      {(() => {
        switch (tab) {
          case "book":
          case "score":
          case "deployment":
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
