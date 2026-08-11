import { RISK_DEFAULTS } from "@powerfund/domain";

export default function PortfolioPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <h1>Portfolio</h1>
          <p>
            Positions, exposure, and mandate checks. Risk defaults are soft UI
            guides until the risk engine lands in Phase 3.
          </p>
        </div>
      </header>

      <section className="stat-row" aria-label="Book summary">
        <div className="stat">
          <span>Open positions</span>
          <strong>0</strong>
        </div>
        <div className="stat">
          <span>NAV</span>
          <strong>—</strong>
        </div>
        <div className="stat">
          <span>Cash</span>
          <strong>—</strong>
        </div>
        <div className="stat">
          <span>Theme cap</span>
          <strong>{RISK_DEFAULTS.maxThemePctNav}%</strong>
        </div>
      </section>

      <section className="panel">
        <h2>Open book</h2>
        <p className="empty">No open positions. Log the first decision when ready.</p>
      </section>
    </>
  );
}
