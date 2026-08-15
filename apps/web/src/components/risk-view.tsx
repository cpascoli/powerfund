import {
  correlationLookup,
  type RiskView,
} from "@/lib/data/risk";
import { RISK_DEFAULTS } from "@powerfund/domain";

function money(value: number): string {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function pct(value: number | null, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function unsignedPct(value: number | null, digits = 0): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

function corrColor(value: number | null): string | undefined {
  if (value == null) return undefined;
  const hue = ((1 - value) / 2) * 170;
  return `hsl(${hue} 55% 88%)`;
}

type Props = {
  view: RiskView;
};

export function RiskViewPanel({ view }: Props) {
  const lookup = correlationLookup(view.pairs);
  const factorOver =
    view.aiCapexPct != null &&
    view.aiCapexPct > RISK_DEFAULTS.maxAiCapexFactorPctNav;

  return (
    <>
      <section className="stat-row" aria-label="Factor and stress">
        <div className="stat">
          <span>AI-capex of NAV</span>
          <strong className={factorOver ? "is-down" : undefined}>
            {unsignedPct(view.aiCapexPct, 1)}
          </strong>
        </div>
        <div className="stat">
          <span>Diversifiers of NAV</span>
          <strong>{unsignedPct(view.diversifierPct, 1)}</strong>
        </div>
        <div className="stat">
          <span>Capex-pause NAV hit</span>
          <strong className="is-down">
            −{money(view.stressNavDelta)}
            {view.stressNavDeltaPct != null
              ? ` (${view.stressNavDeltaPct.toFixed(1)}%)`
              : ""}
          </strong>
        </div>
        <div className="stat">
          <span>Stressed NAV</span>
          <strong>{money(view.stressNav)}</strong>
        </div>
      </section>

      <section className="panel">
        <h2>Hyperscaler capex −20%</h2>
        <p className="muted">
          Haircut each holding by 20% times its mapped AI-capex weight.
          Unclassified names are left unchanged and flagged for review.
          Factor cap is {RISK_DEFAULTS.maxAiCapexFactorPctNav}% of NAV. This
          is the standing stress in mandate rule 10 — not a forecast.
        </p>
        {view.holdings.length === 0 ? (
          <p className="empty">No open positions to stress.</p>
        ) : (
          <ul className="list">
            {view.holdings.map((row) => (
              <li key={row.symbol}>
                <div>
                  <strong>{row.symbol}</strong>
                  <span className="muted">
                    {" "}
                    {row.name} · {row.themeName}
                  </span>
                </div>
                <span>
                  {money(row.marketValue)}
                  {row.aiCapexWeight == null ? (
                    <span className="tag warn-tag"> unclassified</span>
                  ) : row.aiCapexWeight > 0 ? (
                    <span className="tag warn-tag">
                      {" "}
                      complex {Math.round(row.aiCapexWeight * 100)}%
                    </span>
                  ) : (
                    <span className="tag"> diversifier</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Crowding checklist</h2>
        <p className="muted">
          Mandate rule 6, computed from split-adjusted daily closes. Price
          percentile is vs the name&apos;s own history (up to 5 years).
          Extension is vs the 200-day average. Short interest and
          consensus-revision breadth are not ingested yet, so they stay
          unmeasured.
        </p>
        {view.crowding.length === 0 ? (
          <p className="empty">No price history to score.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Theme</th>
                  <th>5y %ile</th>
                  <th>vs 200d</th>
                  <th>Band</th>
                </tr>
              </thead>
              <tbody>
                {view.crowding.map((row) => (
                  <tr key={row.symbol}>
                    <td>
                      <strong>
                        <a href={`/explore/${row.symbol}`}>{row.symbol}</a>
                      </strong>
                      {row.held ? <span className="tag">held</span> : null}
                    </td>
                    <td className="muted">{row.themeName}</td>
                    <td>{unsignedPct(row.crowding.pricePercentile, 0)}</td>
                    <td>{pct(row.crowding.extensionPct)}</td>
                    <td>
                      <span
                        className={
                          row.crowding.band === "crowded"
                            ? "tag warn-tag"
                            : row.crowding.band === "extended"
                              ? "tag"
                              : "tag"
                        }
                      >
                        {row.crowding.band}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Correlation (holdings + active theses)</h2>
        <p className="muted">
          Pearson of overlapping log-returns over ~13 months. Below 20 shared
          days shows as —. High pairwise numbers are the rule-10 warning that
          theme labels are not diversification.
        </p>
        {view.symbols.length < 2 ? (
          <p className="empty">Need at least two names with history.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table corr-table">
              <thead>
                <tr>
                  <th />
                  {view.symbols.map((symbol) => (
                    <th key={symbol}>{symbol}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.symbols.map((row) => (
                  <tr key={row}>
                    <th>{row}</th>
                    {view.symbols.map((col) => {
                      if (row === col) {
                        return (
                          <td key={col} className="corr-diag">
                            1
                          </td>
                        );
                      }
                      const value = lookup.get(`${row}|${col}`) ?? null;
                      return (
                        <td
                          key={col}
                          style={{ background: corrColor(value) }}
                        >
                          {value == null ? "—" : value.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
