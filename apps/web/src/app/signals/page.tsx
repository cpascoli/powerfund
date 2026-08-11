export default function SignalsPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <h1>Signals</h1>
          <p>
            Candidate ideas with rationale and confidence. Manual entries first;
            scorers will feed this inbox in Phase 2.
          </p>
        </div>
      </header>

      <section className="panel">
        <h2>Inbox</h2>
        <p className="empty">
          Empty. Add a manual signal once the database is connected, or wait for
          the first automated scorer.
        </p>
      </section>
    </>
  );
}
