import type { ReactNode } from "react";
import Link from "next/link";
import { RISK_DEFAULTS } from "@powerfund/domain";

import { CashEntryForm } from "@/components/cash-entry-form";
import { ConfirmFillForm } from "@/components/confirm-fill-form";
import { PlannedActionForm } from "@/components/planned-action-form";
import { PositionForm } from "@/components/position-form";
import { PositionTreemap } from "@/components/position-treemap";
import { SellForm } from "@/components/sell-form";
import {
  cancelPlannedAction,
  deferPlannedAction,
  restorePlannedAction,
} from "@/lib/actions/planned-actions";
import { getLedgerSummary } from "@/lib/data/ledger";
import {
  buildDeploymentQueue,
  listOpenPlannedActions,
} from "@/lib/data/planned-actions";
import { getOpenPortfolioBook, withLiveMarks } from "@/lib/data/portfolio";
import { listInstrumentsWithThemes } from "@/lib/data/research";
import {
  computeDrawdown,
  listPortfolioSnapshots,
  snapshotFlags,
} from "@/lib/data/snapshots";

export const dynamic = "force-dynamic";

type PortfolioTab = "book" | "queue" | "mandate" | "ledger";

const TABS: Array<{ id: PortfolioTab; label: string }> = [
  { id: "book", label: "Open book" },
  { id: "queue", label: "Deployment queue" },
  { id: "mandate", label: "Mandate" },
  { id: "ledger", label: "Ledger" },
];

function money(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function pct(value: number | null | undefined, signed = false): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function parseTab(raw: string | undefined): PortfolioTab | null {
  switch (raw) {
    case "book":
    case "queue":
    case "mandate":
    case "ledger":
      return raw;
    default:
      return null;
  }
}

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    add?: string;
    cash?: string;
    plan?: string;
    confirm?: string;
    sell?: string;
  }>;
}) {
  const { tab, add, cash: cashEdit, plan, confirm, sell } = await searchParams;
  const [rawBook, instruments, rawQueue, ledger, snapshots] =
    await Promise.all([
      getOpenPortfolioBook(),
      listInstrumentsWithThemes(),
      listOpenPlannedActions(),
      getLedgerSummary(),
      listPortfolioSnapshots(),
    ]);
  const book = await withLiveMarks(rawBook);
  const queue = buildDeploymentQueue(book, instruments, rawQueue);
  const drawdown = computeDrawdown(snapshots, {
    nav: book.nav,
    invested: book.invested,
    positionsValue: book.marketValue,
  });
  const riskFlags = [...book.flags, ...snapshotFlags(snapshots, drawdown)];
  const showForm = add === "1";
  const showCash = cashEdit === "1";
  const showPlan = plan === "1";
  const confirmAction =
    confirm != null
      ? (queue.actions.find((row) => row.id === confirm) ?? null)
      : null;
  const sellPositionRow =
    sell != null
      ? (book.positions.find((row) => row.id === sell) ?? null)
      : null;
  const busy =
    showForm ||
    showCash ||
    showPlan ||
    confirmAction != null ||
    sellPositionRow != null;
  // A flow parameter decides the tab so every action lands on the surface it belongs to.
  const activeTab: PortfolioTab =
    showPlan || confirmAction != null
      ? "queue"
      : showForm || sellPositionRow != null
        ? "book"
        : showCash
          ? "ledger"
          : (parseTab(tab) ?? "book");
  // Return on capital actually committed, which deposits make measurable.
  const totalReturnPct =
    ledger.depositedCapital > 0
      ? ((book.nav - ledger.depositedCapital) / ledger.depositedCapital) * 100
      : null;
  const bookWarnings = riskFlags.filter((flag) => flag.severity === "warn");
  const queueWarnings = queue.flags.filter((flag) => flag.severity === "warn");

  const bookPanel = (
    <section className="panel" aria-label="Open book">
      <h2>Open book</h2>
      {book.positions.length === 0 ? (
        <p className="empty">
          No open positions yet. Confirm a queued fill or add an unplanned
          fill.
        </p>
      ) : (
        <ul className="list position-list">
          {book.positions.map((position) => {
            const oversize =
              position.weightPctNav != null &&
              position.weightPctNav > RISK_DEFAULTS.maxPositionPctNav;

            return (
              <li key={position.id}>
                <div>
                  <strong>
                    <Link href={`/explore/${position.symbol}`}>
                      {position.symbol}
                    </Link>
                  </strong>
                  <span className="muted">
                    {" "}
                    {position.name} · {position.themeName}
                  </span>
                  <p className="position-meta">
                    {position.quantity.toLocaleString(undefined, {
                      maximumFractionDigits: 5,
                    })}{" "}
                    @ {money(position.avgCost)} · cost {money(position.costBasis)}
                    {position.weightPctNav != null
                      ? ` · ${pct(position.weightPctNav)} NAV`
                      : ""}
                    {position.priceSource === "live" ? (
                      <span className="tag"> {book.markLabel}</span>
                    ) : null}
                    {oversize ? (
                      <span className="tag warn-tag">
                        {" "}
                        above {RISK_DEFAULTS.maxPositionPctNav}% cap
                      </span>
                    ) : null}
                  </p>
                  {position.thesisSummary ? (
                    <p className="muted">{position.thesisSummary}</p>
                  ) : null}
                  {position.invalidation ? (
                    <details className="kill-criteria">
                      <summary>Kill criteria</summary>
                      <p className="muted">{position.invalidation}</p>
                    </details>
                  ) : (
                    <p className="muted">
                      <span className="tag warn-tag">
                        No kill criteria — mandate rule 4 violation
                      </span>
                    </p>
                  )}
                </div>
                <div className="position-mtm">
                  <strong>{money(position.marketValue)}</strong>
                  <span
                    className={
                      (position.unrealizedPnl ?? 0) > 0
                        ? "is-up"
                        : (position.unrealizedPnl ?? 0) < 0
                          ? "is-down"
                          : undefined
                    }
                  >
                    {money(position.unrealizedPnl)} (
                    {pct(position.unrealizedPnlPct, true)})
                  </span>
                  <Link href={`/portfolio?sell=${position.id}`}>
                    Sell or close
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  const queuePanel = (
    <section className="panel" aria-label="Deployment queue">
      <h2>Deployment queue</h2>
      <p className="muted">
        Intend here, execute at the broker, then confirm the fill. Queue vs
        current NAV: cash after {money(queue.cashAfter)} (
        {pct(queue.cashPctAfter)}), invested after {money(queue.investedAfter)}.
      </p>
      {queue.flags.length > 0 ? (
        <ul className="list">
          {queue.flags.map((flag) => (
            <li key={`queue-${flag.label}`}>
              <span className={flag.severity === "warn" ? "is-down" : "is-up"}>
                {flag.severity === "warn" ? "Flag" : "OK"}
              </span>
              <span>{flag.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {queue.actions.length === 0 ? (
        <p className="empty">
          No pending buys. Plan a stub before you hit the tape.
        </p>
      ) : (
        <ul className="list position-list">
          {queue.actions.map((action) => (
            <li key={action.id}>
              <div>
                <strong>
                  <Link href={`/explore/${action.symbol}`}>
                    {action.symbol}
                  </Link>
                </strong>
                <span className="muted">
                  {" "}
                  {action.name} · {action.actionType}
                  {action.status === "deferred" ? " · deferred" : ""}
                </span>
                <p className="position-meta">
                  {money(action.plannedUsd)}
                  {action.plannedPctNav != null
                    ? ` · ${pct(action.plannedPctNav)} NAV`
                    : ""}
                  {action.windowLabel ? ` · ${action.windowLabel}` : ""}
                  {action.dueBy ? ` · due ${action.dueBy}` : ""}
                </p>
                {action.rationale ? (
                  <p className="muted">{action.rationale}</p>
                ) : null}
              </div>
              <div className="queue-actions">
                <Link href={`/portfolio?confirm=${action.id}`}>Confirm</Link>
                {action.status === "deferred" ? (
                  <form action={restorePlannedAction}>
                    <input type="hidden" name="id" value={action.id} />
                    <button type="submit">Restore</button>
                  </form>
                ) : (
                  <form action={deferPlannedAction}>
                    <input type="hidden" name="id" value={action.id} />
                    <button type="submit">Defer</button>
                  </form>
                )}
                <form action={cancelPlannedAction}>
                  <input type="hidden" name="id" value={action.id} />
                  <button type="submit">Cancel</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const mandatePanel = (
    <section className="panel" aria-label="Mandate checks">
      <h2>Mandate</h2>
      <p className="muted">
        Live compliance vs the book. Full rules on the{" "}
        <Link href="/mandate">Mandate page</Link>.
      </p>
      <ul className="list">
        {riskFlags.map((flag) => (
          <li key={`book-${flag.label}`}>
            <span className={flag.severity === "warn" ? "is-down" : "is-up"}>
              {flag.severity === "warn" ? "Flag" : "OK"}
            </span>
            <span>{flag.label}</span>
          </li>
        ))}
      </ul>
      {book.themeExposures.length > 0 ? (
        <ul className="list">
          {book.themeExposures.map((theme) => (
            <li key={theme.slug}>
              <div>
                <strong>{theme.name}</strong>
                <span className="muted"> · {money(theme.marketValue)}</span>
              </div>
              <span className={theme.overCap ? "is-down" : undefined}>
                {pct(theme.weightPctNav)} NAV
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );

  const ledgerPanel = (
    <section className="panel" aria-label="Ledger">
      <h2>Ledger</h2>
      <p className="muted">
        Every balance above is the sum of these entries. History is append-only,
        so a mistake is corrected with an adjustment rather than an edit.
      </p>
      {ledger.entries.length === 0 ? (
        <p className="empty">
          No entries yet. Record a deposit to open the book.
        </p>
      ) : (
        <ul className="list position-list">
          {ledger.entries.map((entry) => (
            <li key={entry.id}>
              <div>
                <strong>
                  {entry.kind}
                  {entry.symbol ? ` ${entry.symbol}` : ""}
                </strong>
                {entry.source !== "manual" ? (
                  <span className="tag"> {entry.source}</span>
                ) : null}
                <p className="position-meta">
                  {new Date(entry.occurredAt).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  {entry.quantity != null && entry.price != null
                    ? ` · ${entry.quantity.toLocaleString(undefined, {
                        maximumFractionDigits: 8,
                      })} @ ${money(entry.price)}`
                    : ""}
                </p>
                {entry.notes ? <p className="muted">{entry.notes}</p> : null}
              </div>
              <div className="position-mtm">
                <strong className={entry.cashDelta > 0 ? "is-up" : undefined}>
                  {entry.cashDelta > 0 ? "+" : ""}
                  {money(entry.cashDelta)}
                </strong>
                {entry.realizedPnl != null ? (
                  <span
                    className={entry.realizedPnl >= 0 ? "is-up" : "is-down"}
                  >
                    realized {money(entry.realizedPnl)}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  let tabContent: ReactNode;
  switch (activeTab) {
    case "book":
      tabContent = (
        <>
          {sellPositionRow ? (
            <section className="panel">
              <h2>Sell {sellPositionRow.symbol}</h2>
              <SellForm position={sellPositionRow} />
            </section>
          ) : null}
          {showForm ? (
            <section className="panel">
              <h2>Add fill</h2>
              <p className="muted">
                Unplanned fill (already executed). Prefer the queue for new
                risk. Cash available: {money(book.cash)}.
              </p>
              <PositionForm instruments={instruments} />
            </section>
          ) : null}
          {bookPanel}
        </>
      );
      break;
    case "queue":
      tabContent = (
        <>
          {confirmAction ? (
            <section className="panel">
              <h2>Confirm fill</h2>
              <ConfirmFillForm action={confirmAction} />
            </section>
          ) : null}
          {showPlan ? (
            <section className="panel">
              <h2>Plan a buy</h2>
              <p className="muted">
                Size in dollars, not shares. This does not debit cash until you
                confirm a fill.
              </p>
              <PlannedActionForm instruments={instruments} />
            </section>
          ) : null}
          {queuePanel}
        </>
      );
      break;
    case "mandate":
      tabContent = mandatePanel;
      break;
    case "ledger":
      tabContent = (
        <>
          {showCash ? (
            <section className="panel">
              <h2>Cash entry</h2>
              <p className="muted">
                Cash is the sum of the ledger, so it changes only through
                entries. Current balance {money(book.cash)}.
              </p>
              <CashEntryForm />
            </section>
          ) : null}
          {ledgerPanel}
        </>
      );
      break;
    default: {
      const _exhaustive: never = activeTab;
      tabContent = _exhaustive;
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Portfolio</h1>
          <p>
            NAV = cash + marked positions ({book.markLabel.toLowerCase()}
            {book.markAsOf
              ? ` as of ${new Date(book.markAsOf).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                  timeZoneName: "short",
                })}`
              : ""}
            ). Plan buys in the queue, then confirm the fill. Weights are % of
            NAV (max name {RISK_DEFAULTS.maxPositionPctNav}%, max theme{" "}
            {RISK_DEFAULTS.maxThemePctNav}%, min cash {RISK_DEFAULTS.minCashPctNav}
            %).
          </p>
        </div>
        <div className="header-actions">
          {busy ? (
            <Link
              className="buttonish subtle"
              href={`/portfolio?tab=${activeTab}`}
            >
              Cancel
            </Link>
          ) : (
            <>
              <Link className="buttonish subtle" href="/portfolio?cash=1">
                Cash entry
              </Link>
              <Link className="buttonish subtle" href="/portfolio?add=1">
                Add fill
              </Link>
              <Link className="buttonish" href="/portfolio?plan=1">
                Plan buy
              </Link>
            </>
          )}
        </div>
      </header>

      <section className="stat-row" aria-label="Book summary">
        <div className="stat">
          <span>NAV ({book.markLabel.toLowerCase()})</span>
          <strong>{money(book.nav)}</strong>
        </div>
        <div className="stat">
          <span>Cash</span>
          <strong>{money(book.cash)}</strong>
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
            {pct(book.cashPctNav)}
          </strong>
        </div>
        <div className="stat">
          <span>Unrealized P&amp;L</span>
          <strong
            className={
              book.unrealizedPnl > 0
                ? "is-up"
                : book.unrealizedPnl < 0
                  ? "is-down"
                  : undefined
            }
          >
            {money(book.unrealizedPnl)}
          </strong>
        </div>
      </section>

      <section className="stat-row" aria-label="Capital and realized results">
        <div className="stat">
          <span>Capital in</span>
          <strong>{money(ledger.depositedCapital)}</strong>
        </div>
        <div className="stat">
          <span>Total return</span>
          <strong
            className={
              totalReturnPct == null
                ? undefined
                : totalReturnPct > 0
                  ? "is-up"
                  : totalReturnPct < 0
                    ? "is-down"
                    : undefined
            }
          >
            {pct(totalReturnPct, true)}
          </strong>
        </div>
        <div className="stat">
          <span>Realized P&amp;L</span>
          <strong
            className={
              ledger.realizedPnl > 0
                ? "is-up"
                : ledger.realizedPnl < 0
                  ? "is-down"
                  : undefined
            }
          >
            {money(ledger.realizedPnl)}
          </strong>
        </div>
        <div className="stat">
          <span>Invested (cost)</span>
          <strong>{money(book.invested)}</strong>
        </div>
      </section>

      <section className="stat-row" aria-label="Deployment vs phase 1">
        <div className="stat">
          <span>Open positions</span>
          <strong>{book.openCount}</strong>
        </div>
        <div className="stat">
          <span>Queued to deploy</span>
          <strong>{money(queue.totalPlannedUsd)}</strong>
        </div>
        <div className="stat">
          <span>Phase-1 invested cap</span>
          <strong>{money(RISK_DEFAULTS.phase1InvestedCapUsd)}</strong>
        </div>
        <div className="stat">
          <span>Ledger entries</span>
          <strong>{ledger.entryCount}</strong>
        </div>
      </section>

      <PositionTreemap positions={book.positions} markLabel={book.markLabel} />

      {bookWarnings.length > 0 || queueWarnings.length > 0 ? (
        <section className="panel" aria-label="Mandate warnings">
          <ul className="list">
            {bookWarnings.map((flag) => (
              <li key={`warn-book-${flag.label}`}>
                <span className="is-down">Flag</span>
                <span>{flag.label}</span>
              </li>
            ))}
            {queueWarnings.map((flag) => (
              <li key={`warn-queue-${flag.label}`}>
                <span className="is-down">Flag</span>
                <span>{flag.label} (queue)</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <nav className="tab-nav" aria-label="Portfolio sections">
        {TABS.map((entry) => {
          const badge =
            entry.id === "book"
              ? book.openCount
              : entry.id === "queue"
                ? queue.actions.length
                : entry.id === "ledger"
                  ? ledger.entryCount
                  : null;
          const warn =
            (entry.id === "mandate" && bookWarnings.length > 0) ||
            (entry.id === "queue" && queueWarnings.length > 0);
          return (
            <Link
              key={entry.id}
              href={`/portfolio?tab=${entry.id}`}
              className={entry.id === activeTab ? "is-active" : undefined}
              aria-current={entry.id === activeTab ? "page" : undefined}
            >
              {entry.label}
              {badge != null && badge > 0 ? (
                <span className="tab-badge">{badge}</span>
              ) : null}
              {warn ? <span className="tab-badge warn">!</span> : null}
            </Link>
          );
        })}
      </nav>

      {tabContent}
    </>
  );
}
