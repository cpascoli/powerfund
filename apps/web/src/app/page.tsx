import Link from "next/link";
import { RISK_DEFAULTS } from "@powerfund/domain";

import {
  buildDeploymentQueue,
  listOpenPlannedActions,
} from "@/lib/data/planned-actions";
import { getOpenPortfolioBook, withLiveMarks } from "@/lib/data/portfolio";
import {
  listInstrumentsWithThemes,
  listThemes,
} from "@/lib/data/research";
import { computeDrawdown, listPortfolioSnapshots } from "@/lib/data/snapshots";

export const dynamic = "force-dynamic";

function daysUntil(date: string): number {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Math.round(
    (new Date(`${date}T00:00:00Z`).getTime() - today.getTime()) / 86_400_000,
  );
}

export default async function BriefingPage() {
  const [themes, instruments, book, rawQueue, snapshots] = await Promise.all([
    listThemes(),
    listInstrumentsWithThemes(),
    getOpenPortfolioBook().then(withLiveMarks),
    listOpenPlannedActions(),
    listPortfolioSnapshots(),
  ]);

  const queue = buildDeploymentQueue(book, instruments, rawQueue);
  const drawdown = computeDrawdown(snapshots, {
    nav: book.nav,
    invested: book.invested,
    positionsValue: book.marketValue,
  });

  // Queue items with a date or window are the calendar; soonest first.
  const upcoming = [...queue.actions].sort((a, b) => {
    if (a.dueBy && b.dueBy) return a.dueBy.localeCompare(b.dueBy);
    if (a.dueBy) return -1;
    if (b.dueBy) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  });

  const coreThemes = themes.filter((theme) => theme.is_core);
  const warnFlags = book.flags.filter((flag) => flag.severity === "warn");
  const overdue = upcoming.filter(
    (action) => action.dueBy != null && daysUntil(action.dueBy) < 0,
  );

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Briefing</h1>
          <p>
            Situational awareness — watchlist coverage now, signals and risk
            flags as they arrive. Deep charts live in{" "}
            <Link href="/workbench">Workbench</Link>; browsing starts in{" "}
            <Link href="/explore">Explore</Link>.
          </p>
        </div>
      </header>

      <section className="stat-row" aria-label="Book and universe">
        <div className="stat">
          <span>NAV</span>
          <strong>
            {book.nav.toLocaleString(undefined, {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            })}
          </strong>
        </div>
        <div className="stat">
          <span>Cash % NAV</span>
          <strong
            className={
              book.cashPctNav < RISK_DEFAULTS.minCashPctNav
                ? "is-down"
                : undefined
            }
          >
            {book.cashPctNav.toFixed(1)}%
          </strong>
        </div>
        <div className="stat">
          <span>Watchlist names</span>
          <strong>{instruments.length}</strong>
        </div>
        <div className="stat">
          <span>Deployed drawdown vs peak</span>
          <strong
            className={
              drawdown.killSwitchBreached
                ? "is-down"
                : (drawdown.deployedDrawdownPp ?? 0) > 0
                  ? undefined
                  : "is-up"
            }
            title={`Kill-switch at ${RISK_DEFAULTS.drawdownKillSwitchPct}% of deployed capital from peak`}
          >
            {drawdown.deployedDrawdownPp == null
              ? "—"
              : `${drawdown.deployedDrawdownPp.toFixed(1)}%`}
          </strong>
        </div>
      </section>

      <div className="grid">
        <section className="panel half">
          <h2>Needs attention</h2>
          {warnFlags.length > 0 ||
          drawdown.killSwitchBreached ||
          overdue.length > 0 ? (
            <ul className="list">
              {drawdown.killSwitchBreached ? (
                <li key="kill-switch">
                  <span className="is-down">Flag</span>
                  <span>
                    Deployed drawdown{" "}
                    {drawdown.deployedDrawdownPp?.toFixed(1)}% breaches the{" "}
                    {RISK_DEFAULTS.drawdownKillSwitchPct}% kill-switch — halt
                    new risk, review the book
                  </span>
                </li>
              ) : null}
              {overdue.map((action) => (
                <li key={`overdue-${action.id}`}>
                  <span className="is-down">Flag</span>
                  <span>
                    {action.symbol} {action.actionType} was due {action.dueBy}{" "}
                    — confirm, defer, or cancel it
                  </span>
                </li>
              ))}
              {warnFlags.map((flag) => (
                <li key={flag.code}>
                  <span className="is-down">Flag</span>
                  <span>{flag.label}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">
              Mandate checks are clear vs NAV. Signal triage will land here
              once the inbox is in use.
            </p>
          )}
        </section>

        <section className="panel half">
          <h2>Upcoming</h2>
          {upcoming.length === 0 ? (
            <p className="empty">
              Nothing queued with a date or window. Plan buys from the{" "}
              <Link href="/portfolio?tab=queue">deployment queue</Link>.
            </p>
          ) : (
            <ul className="list">
              {upcoming.map((action) => {
                const days =
                  action.dueBy != null ? daysUntil(action.dueBy) : null;
                return (
                  <li key={action.id}>
                    <div>
                      <strong>
                        <Link href={`/explore/${action.symbol}`}>
                          {action.symbol}
                        </Link>
                      </strong>
                      <span className="muted">
                        {" "}
                        {action.actionType} $
                        {action.plannedUsd.toLocaleString()}
                        {action.windowLabel ? ` · ${action.windowLabel}` : ""}
                      </span>
                      {action.rationale ? (
                        <div className="muted">{action.rationale}</div>
                      ) : null}
                    </div>
                    {days != null ? (
                      <span className={days <= 7 ? "tag warn-tag" : "tag"}>
                        {days < 0
                          ? `overdue ${action.dueBy}`
                          : days === 0
                            ? "due today"
                            : `due ${action.dueBy}`}
                      </span>
                    ) : (
                      <span className="tag">no date</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="panel half">
          <h2>Core themes</h2>
          <ul className="list">
            {coreThemes.map((theme) => {
              const count = instruments.filter(
                (instrument) => instrument.theme_slug === theme.slug,
              ).length;
              return (
                <li key={theme.id}>
                  <div>
                    <strong>
                      <Link href="/explore">{theme.name}</Link>
                    </strong>
                    <div className="muted">{theme.description}</div>
                  </div>
                  <span className="tag">{count} names</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </>
  );
}
