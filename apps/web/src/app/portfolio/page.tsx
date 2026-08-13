import Link from "next/link";
import { RISK_DEFAULTS } from "@powerfund/domain";

import { CashForm } from "@/components/cash-form";
import { ConfirmFillForm } from "@/components/confirm-fill-form";
import { PlannedActionForm } from "@/components/planned-action-form";
import { PositionForm } from "@/components/position-form";
import {
  cancelPlannedAction,
  deferPlannedAction,
  restorePlannedAction,
} from "@/lib/actions/planned-actions";
import {
  buildDeploymentQueue,
  listOpenPlannedActions,
} from "@/lib/data/planned-actions";
import { getOpenPortfolioBook, withLiveMarks } from "@/lib/data/portfolio";
import { listInstrumentsWithThemes } from "@/lib/data/research";

export const dynamic = "force-dynamic";

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

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{
    add?: string;
    cash?: string;
    plan?: string;
    confirm?: string;
  }>;
}) {
  const { add, cash: cashEdit, plan, confirm } = await searchParams;
  const [rawBook, instruments, rawQueue] = await Promise.all([
    getOpenPortfolioBook(),
    listInstrumentsWithThemes(),
    listOpenPlannedActions(),
  ]);
  const book = await withLiveMarks(rawBook);
  const queue = buildDeploymentQueue(book, instruments, rawQueue);
  const showForm = add === "1";
  const showCash = cashEdit === "1";
  const showPlan = plan === "1";
  const confirmAction =
    confirm != null
      ? (queue.actions.find((row) => row.id === confirm) ?? null)
      : null;
  const busy = showForm || showCash || showPlan || confirmAction != null;

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
            <Link className="buttonish subtle" href="/portfolio">
              Cancel
            </Link>
          ) : (
            <>
              <Link className="buttonish subtle" href="/portfolio?cash=1">
                Edit cash
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

      <section className="stat-row" aria-label="Invested vs phase 1">
        <div className="stat">
          <span>Open positions</span>
          <strong>{book.openCount}</strong>
        </div>
        <div className="stat">
          <span>Invested (cost)</span>
          <strong>{money(book.invested)}</strong>
        </div>
        <div className="stat">
          <span>Queued to deploy</span>
          <strong>{money(queue.totalPlannedUsd)}</strong>
        </div>
        <div className="stat">
          <span>Phase-1 invested cap</span>
          <strong>{money(RISK_DEFAULTS.phase1InvestedCapUsd)}</strong>
        </div>
      </section>

      <section className="panel" aria-label="Mandate checks">
        <h2>Mandate</h2>
        <ul className="list">
          {book.flags.map((flag) => (
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

      {showCash ? (
        <section className="panel">
          <h2>Cash</h2>
          <p className="muted">
            Set the uninvested PowerFund cash. Confirming a fill debits this by
            cost basis.
          </p>
          <CashForm cash={book.cash} notes={book.cashNotes} />
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

      {confirmAction ? (
        <section className="panel">
          <h2>Confirm fill</h2>
          <ConfirmFillForm action={confirmAction} />
        </section>
      ) : null}

      <section className="panel">
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
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {showForm ? (
        <section className="panel">
          <h2>Add fill</h2>
          <p className="muted">
            Unplanned fill (already executed). Prefer the queue for new risk.
            Cash available: {money(book.cash)}.
          </p>
          <PositionForm instruments={instruments} />
        </section>
      ) : null}
    </>
  );
}
