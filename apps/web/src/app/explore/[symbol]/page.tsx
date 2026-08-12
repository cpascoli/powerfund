import Link from "next/link";
import { notFound } from "next/navigation";

import { DossierForm } from "@/components/dossier-form";
import { PriceHistoryChart } from "@/components/price-history-chart";
import { PriceReturnsRow } from "@/components/price-returns-row";
import {
  getInstrumentDossier,
  getInstrumentMarketSnapshot,
  getInstrumentPriceHistory,
} from "@/lib/data/research";
import { computePriceReturns } from "@/lib/market/returns";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ edit?: string }>;
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

export default async function InstrumentDossierPage({
  params,
  searchParams,
}: PageProps) {
  const { symbol } = await params;
  const { edit } = await searchParams;
  const result = await getInstrumentDossier(symbol);
  if (!result) {
    notFound();
  }

  const { instrument, dossier } = result;
  const [market, priceHistory] = await Promise.all([
    getInstrumentMarketSnapshot(instrument.id),
    getInstrumentPriceHistory(instrument.id),
  ]);
  const returns = computePriceReturns(priceHistory);
  const editing = edit === "1" || !dossier;

  const formatUsd = (value: number | null) => {
    if (value == null) return "—";
    const abs = Math.abs(value);
    if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  };

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
        <div className="header-actions">
          {dossier && !editing ? (
            <Link className="buttonish" href={`/explore/${instrument.symbol}?edit=1`}>
              Edit dossier
            </Link>
          ) : null}
          {editing && dossier ? (
            <Link className="buttonish subtle" href={`/explore/${instrument.symbol}`}>
              Cancel
            </Link>
          ) : null}
          <Link
            className="buttonish subtle"
            href={`/decisions/new?instrument=${instrument.id}`}
          >
            Log decision
          </Link>
        </div>
      </header>

      <PriceHistoryChart symbol={instrument.symbol} points={priceHistory} />
      <PriceReturnsRow returns={returns} />

      <section className="stat-row" aria-label="Dossier status">
        <div className="stat">
          <span>Status</span>
          <strong>{dossier?.status ?? "new"}</strong>
        </div>
        <div className="stat">
          <span>Last close</span>
          <strong>
            {market.lastClose != null
              ? `$${market.lastClose.toFixed(2)}`
              : "—"}
          </strong>
        </div>
        <div className="stat">
          <span>Market cap</span>
          <strong>{formatUsd(market.marketCap)}</strong>
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

      <section className="stat-row" aria-label="Latest fundamentals">
        <div className="stat">
          <span>Revenue (qtr)</span>
          <strong>{formatUsd(market.latestRevenue)}</strong>
        </div>
        <div className="stat">
          <span>FCF (qtr)</span>
          <strong>{formatUsd(market.latestFcf)}</strong>
        </div>
        <div className="stat">
          <span>Capex (qtr)</span>
          <strong>{formatUsd(market.latestCapex)}</strong>
        </div>
        <div className="stat">
          <span>Net debt</span>
          <strong>{formatUsd(market.latestNetDebt)}</strong>
        </div>
      </section>

      {editing ? (
        <section className="panel">
          <h2>{dossier ? "Edit dossier" : "Create dossier"}</h2>
          <p className="muted">
            Capture thesis, risks, and next diligence. Verify numbers before
            any capital decision.
          </p>
          <DossierForm
            instrumentId={instrument.id}
            symbol={instrument.symbol}
            dossier={dossier}
          />
        </section>
      ) : (
        <>
          <section className="panel">
            <h2>Summary</h2>
            <p className="dossier-body">{dossier?.summary}</p>
            {dossier?.source ? (
              <p className="muted">Source: {dossier.source}</p>
            ) : null}
          </section>
          <Section title="Thesis" body={dossier?.thesis} />
          <Section title="Catalysts" body={dossier?.catalysts} />
          <Section title="Risks" body={dossier?.risks} />
          <Section title="Invalidation" body={dossier?.invalidation} />
          <Section
            title="Competitive notes"
            body={dossier?.competitive_notes}
          />
          <Section title="Next diligence" body={dossier?.next_diligence} />
        </>
      )}
    </>
  );
}
