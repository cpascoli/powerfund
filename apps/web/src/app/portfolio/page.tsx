import Link from "next/link";
import { RISK_DEFAULTS } from "@powerfund/domain";

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

function pct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const { add } = await searchParams;
  const [book, instruments] = await Promise.all([
    getOpenPortfolioBook(),
    listInstrumentsWithThemes(),
  ]);
  const showForm = add === "1" || book.openCount === 0;
  const vrt = instruments.find((row) => row.symbol === "VRT");

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Portfolio</h1>
          <p>
            Open book marked to the latest daily close. Cash tracking comes
            next — for now this is invested equity only.
          </p>
        </div>
        <div className="header-actions">
          {showForm ? null : (
            <Link className="buttonish" href="/portfolio?add=1">
              Add position
            </Link>
          )}
          {showForm && book.openCount > 0 ? (
            <Link className="buttonish subtle" href="/portfolio">
              Cancel
            </Link>
          ) : null}
        </div>
      </header>

      <section className="stat-row" aria-label="Book summary">
        <div className="stat">
          <span>Open positions</span>
          <strong>{book.openCount}</strong>
        </div>
        <div className="stat">
          <span>Invested</span>
          <strong>{money(book.invested)}</strong>
        </div>
        <div className="stat">
          <span>Market value</span>
          <strong>{money(book.marketValue)}</strong>
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

      <section className="panel">
        <h2>Open book</h2>
        {book.positions.length === 0 ? (
          <p className="empty">
            No open positions yet. Add your first fill below.
          </p>
        ) : (
          <ul className="list position-list">
            {book.positions.map((position) => {
              const weight =
                book.marketValue > 0 && position.marketValue != null
                  ? (position.marketValue / book.marketValue) * 100
                  : null;
              const oversize =
                weight != null && weight > RISK_DEFAULTS.maxPositionPctNav;

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
                      {weight != null ? ` · ${weight.toFixed(1)}% of book` : ""}
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
                      {pct(position.unrealizedPnlPct)})
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
            Record a fill. Market value uses the latest ingested close.
          </p>
          <PositionForm
            instruments={instruments}
            defaults={
              book.openCount === 0 && vrt
                ? {
                    instrumentId: vrt.id,
                    quantity: "16.86133",
                    avgCost: "296.54",
                    thesisSummary:
                      "Quality AI-infra / cooling compounder; first live book entry.",
                  }
                : undefined
            }
          />
        </section>
      ) : null}
    </>
  );
}
