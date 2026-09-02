import Link from "next/link";

import { DecisionForm } from "@/components/decision-form";
import { isOperator } from "@/lib/auth/operator";
import { listInstrumentsWithThemes } from "@/lib/data/research";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Log decision",
};

type PageProps = {
  searchParams: Promise<{ instrument?: string }>;
};

export default async function NewDecisionPage({ searchParams }: PageProps) {
  const { instrument } = await searchParams;
  const [operator, instruments] = await Promise.all([
    isOperator(),
    listInstrumentsWithThemes(),
  ]);

  return (
    <>
      <header className="page-header">
        <div>
          <p className="crumb">
            <Link href="/decisions">Journal</Link>
            <span aria-hidden="true"> / </span>
            New
          </p>
          <h1>Log decision</h1>
          <p>
            Write the thesis and kill criteria now — outcomes can be filled in
            later.
          </p>
        </div>
      </header>

      <section className="panel">
        {operator ? (
          <DecisionForm
            instruments={instruments}
            defaultInstrumentId={instrument ?? null}
          />
        ) : (
          <p className="empty">
            This account has read-only access to the book. Browse the journal
            from <Link href="/decisions">Journal</Link>.
          </p>
        )}
      </section>
    </>
  );
}
