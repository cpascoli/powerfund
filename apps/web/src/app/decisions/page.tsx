import Link from "next/link";

import { JournalPanel } from "@/components/journal-panel";
import { listDecisions } from "@/lib/data/decisions";
import { parseJournalHorizon } from "@/lib/data/journal-agenda";
import { listInstrumentsWithThemes } from "@/lib/data/research";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Journal",
};

type PageProps = {
  searchParams: Promise<{ symbol?: string; when?: string }>;
};

export default async function DecisionsPage({ searchParams }: PageProps) {
  const { symbol: rawSymbol, when } = await searchParams;
  const selected = rawSymbol?.trim().toUpperCase() ?? "";
  const [decisions, instruments] = await Promise.all([
    listDecisions(),
    listInstrumentsWithThemes(),
  ]);
  const companies = [...instruments]
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
    .map((row) => ({ id: row.id, symbol: row.symbol, name: row.name }));

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Journal</h1>
          <p>
            What we decided: thesis, catalysts, risks, invalidation, sizing,
            and outcome review. Event history lives on{" "}
            <Link href="/calendar?view=past">Calendar past</Link>.
          </p>
        </div>
      </header>

      <JournalPanel
        decisions={decisions}
        companies={companies}
        initialHorizon={parseJournalHorizon(when)}
        initialSymbol={selected}
      />
    </>
  );
}
