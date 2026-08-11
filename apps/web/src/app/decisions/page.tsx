import Link from "next/link";

import { listDecisions } from "@/lib/data/decisions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Journal",
};

export default async function DecisionsPage() {
  const decisions = await listDecisions();

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Journal</h1>
          <p>
            Thesis, catalysts, risks, invalidation, sizing, and outcome review.
            Process quality compounds; vibes do not.
          </p>
        </div>
        <div className="header-actions">
          <Link className="buttonish" href="/decisions/new">
            Log decision
          </Link>
        </div>
      </header>

      <section className="panel">
        <h2>Entries</h2>
        {decisions.length === 0 ? (
          <p className="empty">
            No decisions recorded yet. Log a watch/investigate/enter before or
            at the time of any material action.
          </p>
        ) : (
          <ul className="list">
            {decisions.map((decision) => (
              <li key={decision.id}>
                <div>
                  <strong>
                    <Link href={`/decisions/${decision.id}`}>
                      {decision.decision_type}
                      {decision.symbol ? ` · ${decision.symbol}` : ""}
                    </Link>
                  </strong>
                  <div className="muted">
                    {new Date(decision.action_at).toLocaleString()} —{" "}
                    {decision.thesis.length > 140
                      ? `${decision.thesis.slice(0, 140)}…`
                      : decision.thesis}
                  </div>
                </div>
                <span className="tag">{decision.decision_type}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
