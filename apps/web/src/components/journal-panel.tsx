"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

import { JournalCompanyFilter } from "@/components/journal-company-filter";
import type { DecisionListItem } from "@/lib/data/decisions";
import {
  JOURNAL_HORIZON_ITEMS,
  filterJournalEntries,
  journalDayGroups,
  journalEmptyCopy,
  replaceJournalSearch,
  type JournalHorizon,
} from "@/lib/data/journal-agenda";

export type JournalCompany = {
  id: string;
  symbol: string;
  name: string;
};

type JournalPanelProps = {
  decisions: DecisionListItem[];
  companies: JournalCompany[];
  initialHorizon: JournalHorizon;
  initialSymbol: string;
};

function weekdayCaption(isToday: boolean, isYesterday: boolean, weekday: string) {
  if (isToday) return "Today";
  if (isYesterday) return "Yesterday";
  return weekday;
}

export function JournalPanel({
  decisions,
  companies,
  initialHorizon,
  initialSymbol,
}: JournalPanelProps) {
  const [horizon, setHorizon] = useState<JournalHorizon>(initialHorizon);
  const [symbol, setSymbol] = useState(initialSymbol);

  function selectHorizon(next: JournalHorizon) {
    setHorizon(next);
    replaceJournalSearch({ horizon: next, symbol });
  }

  function selectSymbol(next: string) {
    setSymbol(next);
    replaceJournalSearch({ horizon, symbol: next });
  }

  const filtered = filterJournalEntries(decisions, horizon, symbol);
  const days = journalDayGroups(filtered);
  const showMonths = horizon !== "this_week";
  const selected = companies.find((row) => row.symbol === symbol);
  const logHref = selected
    ? `/decisions/new?instrument=${selected.id}`
    : "/decisions/new";

  let lastMonth = "";

  return (
    <section className="panel" aria-label="Journal entries">
      <div className="price-panel-head">
        <div>
          <h2>Entries</h2>
          <p className="muted">
            {filtered.length === 1 ? "1 entry" : `${filtered.length} entries`}
            {symbol ? ` · ${symbol}` : ""}
          </p>
        </div>
        <Link className="buttonish" href={logHref}>
          Log decision
        </Link>
      </div>
      <div className="upcoming-filters journal-filters">
        <div className="workbench-controls">
          <JournalCompanyFilter
            companies={companies}
            value={symbol}
            onChange={selectSymbol}
          />
        </div>
        <div className="seg" role="group" aria-label="When">
          {JOURNAL_HORIZON_ITEMS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={entry.id === horizon ? "is-active" : undefined}
              aria-pressed={entry.id === horizon}
              onClick={() => selectHorizon(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="empty">{journalEmptyCopy(horizon, symbol)}</p>
      ) : (
        <table className="agenda">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">UTC</th>
              <th scope="col">Entry</th>
              <th scope="col">Type</th>
            </tr>
          </thead>
          <tbody>
            {days.flatMap((day) => {
              const nodes: ReactNode[] = [];
              if (showMonths && day.monthLabel && day.monthLabel !== lastMonth) {
                lastMonth = day.monthLabel;
                nodes.push(
                  <tr key={`${day.date}-month`} className="agenda-month">
                    <td colSpan={4}>{day.monthLabel}</td>
                  </tr>,
                );
              }
              day.rows.forEach((row, index) => {
                nodes.push(
                  <tr
                    key={row.id}
                    className={day.isToday ? "is-today" : undefined}
                  >
                    <td className="agenda-date">
                      {index === 0 ? (
                        <>
                          <strong>{day.dayMonth}</strong>
                          <span>
                            {weekdayCaption(
                              day.isToday,
                              day.isYesterday,
                              day.weekday,
                            )}
                          </span>
                        </>
                      ) : null}
                    </td>
                    <td className="agenda-time">{row.time}</td>
                    <td>
                      <Link href={row.href}>{row.title}</Link>
                      <div className="muted">
                        {row.thesis.length > 140
                          ? `${row.thesis.slice(0, 140)}…`
                          : row.thesis}
                      </div>
                    </td>
                    <td className="agenda-kind">
                      <span className="tag">{row.decisionType}</span>
                    </td>
                  </tr>,
                );
              });
              return nodes;
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
