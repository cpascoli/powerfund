import {
  listScorerTransitions,
  setupChangeLabel,
  transitionCauseLabel,
} from "@/lib/data/signals";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Signals",
};

function formatTime(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
}

export default async function SignalsPage() {
  const rows = await listScorerTransitions();

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Signals</h1>
          <p>
            Shadow log of setup transitions from fundamental_inflection_v1.
            Research-priority only — not a buy list, and not wired into Briefing
            or the buy gate.
          </p>
        </div>
      </header>

      <section className="panel">
        <h2>Inflection transitions</h2>
        {rows.length === 0 ? (
          <p className="empty">
            No scorer transitions yet. First run populates Explore setups
            without flooding this log. After that:{" "}
            <code>pnpm score:inflection</code> (also runs after EOD bars and
            fundamentals ingest).
          </p>
        ) : (
          <table className="catalog">
            <thead>
              <tr>
                <th>When</th>
                <th>Ticker</th>
                <th>Change</th>
                <th>Cause</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="muted">{formatTime(row.firedAt)}</td>
                  <td>
                    <strong>{row.symbol}</strong>
                  </td>
                  <td>{setupChangeLabel(row)}</td>
                  <td>
                    {row.cause ? (
                      <span className="tag">{transitionCauseLabel(row.cause)}</span>
                    ) : (
                      "—"
                    )}
                    {row.stale ? <span className="tag warn">stale</span> : null}
                  </td>
                  <td>{row.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
