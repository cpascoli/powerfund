import Link from "next/link";

import { JournalCompanyFilter } from "@/components/journal-company-filter";
import { listDecisions } from "@/lib/data/decisions";
import { listInstrumentsWithThemes } from "@/lib/data/research";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Journal",
};

type PageProps = {
  searchParams: Promise<{ symbol?: string }>;
};

function journalCompanies(
  instruments: Awaited<ReturnType<typeof listInstrumentsWithThemes>>,
) {
  return [...instruments]
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
    .map((row) => ({ symbol: row.symbol, name: row.name }));
}

export default async function DecisionsPage({ searchParams }: PageProps) {
  const { symbol: rawSymbol } = await searchParams;
  const selected = rawSymbol?.trim().toUpperCase() ?? "";
  const [decisions, instruments] = await Promise.all([
    listDecisions(),
    listInstrumentsWithThemes(),
  ]);
  const companies = journalCompanies(instruments);
  const filtered =
    selected.length > 0
      ? decisions.filter((row) => row.symbol === selected)
      : decisions;
  const selectedInstrument = instruments.find((row) => row.symbol === selected);

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
          <Link
            className="buttonish"
            href={
              selectedInstrument
                ? `/decisions/new?instrument=${selectedInstrument.id}`
                : "/decisions/new"
            }
          >
            Log decision
          </Link>
        </div>
      </header>

      <section className="panel">
        <div className="price-panel-head">
          <div>
            <h2>Entries</h2>
            <p className="muted">
              {selected
                ? `${filtered.length} for ${selected}`
                : `${filtered.length} total`}
            </p>
          </div>
          <div className="workbench-controls">
            <JournalCompanyFilter companies={companies} value={selected} />
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className="empty">
            {selected
              ? `No journal entries for ${selected}.`
              : "No decisions recorded yet. Log a watch/investigate/enter before or at the time of any material action."}
          </p>
        ) : (
          <ul className="list">
            {filtered.map((decision) => (
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
