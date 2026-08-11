import Link from "next/link";
import { RISK_DEFAULTS } from "@powerfund/domain";

import {
  listInstrumentsWithThemes,
  listThemes,
} from "@/lib/data/research";

export const dynamic = "force-dynamic";

export default async function BriefingPage() {
  const [themes, instruments] = await Promise.all([
    listThemes(),
    listInstrumentsWithThemes(),
  ]);

  const coreThemes = themes.filter((theme) => theme.is_core);

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
          <span>Watchlist names</span>
          <strong>{instruments.length}</strong>
        </div>
        <div className="stat">
          <span>Core themes</span>
          <strong>{coreThemes.length}</strong>
        </div>
        <div className="stat">
          <span>Max position</span>
          <strong>{RISK_DEFAULTS.maxPositionPctNav}%</strong>
        </div>
        <div className="stat">
          <span>Drawdown kill-switch</span>
          <strong>{RISK_DEFAULTS.drawdownKillSwitchPct}%</strong>
        </div>
      </section>

      <div className="grid">
        <section className="panel half">
          <h2>Needs attention</h2>
          <p className="empty">
            No open signals or risk flags yet. Triage will land here once the
            signal inbox is in use.
          </p>
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
