import Link from "next/link";

/**
 * Shown where a viewer lands on a surface built from the book.
 *
 * RLS is the boundary: positions, cash, the ledger and the queue simply do not
 * return rows for a viewer. But a row-level refusal is silent — the page would
 * render a NAV of zero and an empty book, which reads as "the fund holds
 * nothing" rather than "this is not yours to see". Say which.
 */
export function OperatorOnly({ surface }: { surface: string }) {
  return (
    <>
      <header className="page-header">
        <div>
          <h1>{surface}</h1>
          <p>Read-only access</p>
        </div>
      </header>
      <section className="panel">
        <p className="empty">
          This account can read the research — themes, dossiers, the journal and
          the calendar — but not the book. Positions, cash, the ledger and the
          deployment queue are the operator&rsquo;s.
        </p>
        <p className="empty">
          Portfolio weights and theme exposure are published on the{" "}
          <Link href="/">public site</Link>, and the research universe is under{" "}
          <Link href="/explore">Explore</Link>.
        </p>
      </section>
    </>
  );
}
