import Link from "next/link";
import { RISK_DEFAULTS } from "@powerfund/domain";

import { getOpenPortfolioBook, withLiveMarks } from "@/lib/data/portfolio";
import {
  listInstrumentsWithThemes,
  listThemes,
} from "@/lib/data/research";

export const dynamic = "force-dynamic";

export default async function BriefingPage() {
  const [themes, instruments, book] = await Promise.all([
    listThemes(),
    listInstrumentsWithThemes(),
    getOpenPortfolioBook().then(withLiveMarks),
  ]);

  const coreThemes = themes.filter((theme) => theme.is_core);
  const warnFlags = book.flags.filter((flag) => flag.severity === "warn");

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
          <span>Max position</span>
          <strong>{RISK_DEFAULTS.maxPositionPctNav}%</strong>
        </div>
      </section>

      <div className="grid">
        <section className="panel half">
          <h2>Needs attention</h2>
          {warnFlags.length > 0 ? (
            <ul className="list">
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
