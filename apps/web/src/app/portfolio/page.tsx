import Link from "next/link";
import { RISK_DEFAULTS } from "@powerfund/domain";

import { CashForm } from "@/components/cash-form";
import { PositionForm } from "@/components/position-form";
import { getOpenPortfolioBook } from "@/lib/data/portfolio";
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
  searchParams: Promise<{ add?: string; cash?: string }>;
}) {
  const { add, cash: cashEdit } = await searchParams;
  const [book, instruments] = await Promise.all([
    getOpenPortfolioBook(),
    listInstrumentsWithThemes(),
  ]);
  const showForm = add === "1";
  const showCash = cashEdit === "1";

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Portfolio</h1>
          <p>
            NAV = cash + marked positions. Weights are % of NAV against the
            mandate (max name {RISK_DEFAULTS.maxPositionPctNav}%, max theme{" "}
            {RISK_DEFAULTS.maxThemePctNav}%, min cash {RISK_DEFAULTS.minCashPctNav}
            %). BTC and gold stay outside this book.
          </p>
        </div>
        <div className="header-actions">
          <Link className="buttonish subtle" href="/portfolio?cash=1">
            Edit cash
          </Link>
          {showForm ? (
            <Link className="buttonish subtle" href="/portfolio">
              Cancel
            </Link>
          ) : (
            <Link className="buttonish" href="/portfolio?add=1">
              Add position
            </Link>
          )}
        </div>
      </header>

      <section className="stat-row" aria-label="Book summary">
        <div className="stat">
          <span>NAV</span>
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
          <span>Equities MTM</span>
          <strong>{money(book.marketValue)}</strong>
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
            <li key={flag.label}>
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

      {showCash ? (
        <section className="panel">
          <h2>Cash</h2>
          <p className="muted">
            Set the uninvested PowerFund cash. Adding a position debits this
            automatically by cost basis.
          </p>
          <CashForm cash={book.cash} notes={book.cashNotes} />
        </section>
      ) : null}

      <section className="panel">
        <h2>Open book</h2>
        {book.positions.length === 0 ? (
          <p className="empty">
            No open positions yet. Add a fill to debit cash and start the book.
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
          <h2>Add position</h2>
          <p className="muted">
            Record a fill. Cost is taken from cash. Market value uses the latest
            ingested close. Cash available: {money(book.cash)}.
          </p>
          <PositionForm instruments={instruments} />
        </section>
      ) : null}
    </>
  );
}
