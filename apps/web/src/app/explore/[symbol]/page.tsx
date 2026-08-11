import Link from "next/link";
import { notFound } from "next/navigation";

import { getInstrumentDossier } from "@/lib/data/research";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ symbol: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { symbol } = await params;
  return { title: `${symbol.toUpperCase()} dossier` };
}

function Section({
  title,
  body,
}: {
  title: string;
  body: string | null | undefined;
}) {
  if (!body) return null;
  return (
    <section className="panel">
      <h2>{title}</h2>
      <p className="dossier-body">{body}</p>
    </section>
  );
}

export default async function InstrumentDossierPage({ params }: PageProps) {
  const { symbol } = await params;
  const result = await getInstrumentDossier(symbol);
  if (!result) {
    notFound();
  }

  const { instrument, dossier } = result;

  return (
    <>
      <header className="page-header">
        <div>
          <p className="crumb">
            <Link href="/explore">Explore</Link>
            <span aria-hidden="true"> / </span>
            {instrument.symbol}
          </p>
          <h1>
            {instrument.symbol}{" "}
            <span className="muted">{instrument.name}</span>
          </h1>
          <p>
            {instrument.theme_name}
            {instrument.notes ? ` · ${instrument.notes}` : ""}
          </p>
        </div>
      </header>

      <section className="stat-row" aria-label="Dossier status">
        <div className="stat">
          <span>Status</span>
          <strong>{dossier?.status ?? "no dossier"}</strong>
        </div>
        <div className="stat">
          <span>Book status</span>
          <strong>{instrument.status}</strong>
        </div>
        <div className="stat">
          <span>Theme</span>
          <strong>{instrument.theme_name}</strong>
        </div>
        <div className="stat">
          <span>Updated</span>
          <strong>
            {dossier
              ? new Date(dossier.updated_at).toLocaleDateString()
              : "—"}
          </strong>
        </div>
      </section>

      {!dossier ? (
        <section className="panel">
          <h2>Dossier</h2>
          <p className="empty">
            No research stub yet. This name is on the watchlist only.
          </p>
        </section>
      ) : (
        <>
          <section className="panel">
            <h2>Summary</h2>
            <p className="dossier-body">{dossier.summary}</p>
            {dossier.source ? (
              <p className="muted">Source: {dossier.source}</p>
            ) : null}
          </section>
          <Section title="Thesis" body={dossier.thesis} />
          <Section title="Catalysts" body={dossier.catalysts} />
          <Section title="Risks" body={dossier.risks} />
          <Section title="Invalidation" body={dossier.invalidation} />
          <Section
            title="Competitive notes"
            body={dossier.competitive_notes}
          />
          <Section title="Next diligence" body={dossier.next_diligence} />
        </>
      )}
    </>
  );
}
