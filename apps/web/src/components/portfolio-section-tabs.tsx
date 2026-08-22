"use client";

import { useState, type ReactNode } from "react";

import {
  SECTION_TAB_ITEMS,
  replacePortfolioSectionTab,
  type PortfolioSectionTab,
} from "@/lib/portfolio-href";

export type SectionPanel = {
  form?: ReactNode;
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
  const [showForm, setShowForm] = useState(true);

  function select(next: PortfolioSectionTab) {
    setTab(next);
    setShowForm(false);
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
      {showForm ? panel.form : null}
      {panel.body}
    </>
  );
}
