import Link from "next/link";
import { notFound } from "next/navigation";

import { DecisionForm } from "@/components/decision-form";
import { isOperator } from "@/lib/auth/operator";
import { getDecision } from "@/lib/data/decisions";
import { listInstrumentsWithThemes } from "@/lib/data/research";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const decision = await getDecision(id);
  if (!decision) {
    return { title: "Decision" };
  }
  return {
    title: `${decision.decision_type}${decision.symbol ? ` · ${decision.symbol}` : ""}`,
  };
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

export default async function DecisionDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { edit } = await searchParams;
  const [decision, instruments] = await Promise.all([
    getDecision(id),
    listInstrumentsWithThemes(),
  ]);

  if (!decision) {
    notFound();
  }

  const operator = await isOperator();
  const editing = operator && edit === "1";

  return (
    <>
      <header className="page-header">
        <div>
          <p className="crumb">
            <Link href="/decisions">Journal</Link>
            <span aria-hidden="true"> / </span>
            {decision.decision_type}
            {decision.symbol ? ` · ${decision.symbol}` : ""}
          </p>
          <h1>
            {decision.decision_type}
            {decision.symbol ? (
              <>
                {" "}
                <span className="muted">{decision.symbol}</span>
              </>
            ) : null}
          </h1>
          <p>
            {new Date(decision.action_at).toLocaleString()}
            {decision.instrument_name ? ` · ${decision.instrument_name}` : ""}
          </p>
        </div>
        <div className="header-actions">
          {editing ? (
            <Link className="buttonish subtle" href={`/decisions/${decision.id}`}>
              Cancel
            </Link>
          ) : operator ? (
            <Link
              className="buttonish"
              href={`/decisions/${decision.id}?edit=1`}
            >
              Edit
            </Link>
          ) : null}
          {decision.symbol ? (
            <Link
              className="buttonish subtle"
              href={`/explore/${decision.symbol}`}
            >
              Open dossier
            </Link>
          ) : null}
        </div>
      </header>

      {editing ? (
        <section className="panel">
          <h2>Edit decision</h2>
          <DecisionForm instruments={instruments} decision={decision} />
        </section>
      ) : (
        <>
          <Section title="Thesis" body={decision.thesis} />
          <Section title="Catalysts" body={decision.catalysts} />
          <Section title="Risks" body={decision.risks} />
          <Section title="Invalidation" body={decision.invalidation} />
          <Section title="Sizing rationale" body={decision.sizing_rationale} />
          <Section title="Outcome notes" body={decision.outcome_notes} />
          <Section title="Outcome grade" body={decision.outcome_grade} />
        </>
      )}
    </>
  );
}
