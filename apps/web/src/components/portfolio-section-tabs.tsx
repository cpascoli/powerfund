"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  SECTION_TAB_ITEMS,
  replacePortfolioSectionTab,
  type PortfolioSectionTab,
} from "@/lib/portfolio-href";

export type SectionPanel = {
  body: ReactNode;
};

type PortfolioSectionTabsProps = {
  initialTab: PortfolioSectionTab;
  badges: Partial<Record<PortfolioSectionTab, number>>;
  warnings: Partial<Record<PortfolioSectionTab, boolean>>;
  panels: Record<PortfolioSectionTab, SectionPanel>;
};

export function PortfolioSectionTabs({
  initialTab,
  badges,
  warnings,
  panels,
}: PortfolioSectionTabsProps) {
  const [tab, setTab] = useState<PortfolioSectionTab>(initialTab);

  // A navigation (a "Confirm" link, a form redirect) can change the tab the
  // server chose while this component stays mounted; follow it. Tab clicks
  // only rewrite the URL in place, so they do not trigger this.
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  function select(next: PortfolioSectionTab) {
    setTab(next);
    replacePortfolioSectionTab(next);
  }

  let panel: SectionPanel;
  switch (tab) {
    case "book":
    case "queue":
    case "mandate":
    case "performance":
    case "ledger":
      panel = panels[tab];
      break;
    default: {
      const _exhaustive: never = tab;
      panel = _exhaustive;
    }
  }

  return (
    <>
      <nav className="tab-nav" aria-label="Portfolio sections">
        {SECTION_TAB_ITEMS.map((entry) => {
          const badge = badges[entry.id];
          const warn = warnings[entry.id] === true;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={entry.id === tab}
              className={entry.id === tab ? "is-active" : undefined}
              onClick={() => select(entry.id)}
            >
              {entry.label}
              {badge != null && badge > 0 ? (
                <span className="tab-badge">{badge}</span>
              ) : null}
              {warn ? <span className="tab-badge warn">!</span> : null}
            </button>
          );
        })}
      </nav>
      {panel.body}
    </>
  );
}
