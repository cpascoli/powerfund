export default function WorkbenchPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <h1>Workbench</h1>
          <p>
            Deep visualization and comparison space — relative strength, event
            markers, factor histories, and dataset views. Saved views will live
            here so weekly research does not start from a blank chart.
          </p>
        </div>
      </header>

      <section className="stat-row" aria-label="Workbench capabilities">
        <div className="stat">
          <span>Price + events</span>
          <strong>Soon</strong>
        </div>
        <div className="stat">
          <span>Theme vs benchmark</span>
          <strong>Soon</strong>
        </div>
        <div className="stat">
          <span>Dataset browser</span>
          <strong>Soon</strong>
        </div>
        <div className="stat">
          <span>Saved views</span>
          <strong>Soon</strong>
        </div>
      </section>

      <section className="panel">
        <h2>How this space will work</h2>
        <ul className="list">
          <li>
            <div>
              <strong>Question-titled charts</strong>
              <div className="muted">
                Every view answers something concrete — not “Chart 1”.
              </div>
            </div>
          </li>
          <li>
            <div>
              <strong>Context from Explore</strong>
              <div className="muted">
                Open Workbench from a theme or dossier with filters already set.
              </div>
            </div>
          </li>
          <li>
            <div>
              <strong>Evidence beside the series</strong>
              <div className="muted">
                Link filings, signals, and decisions next to the plot.
              </div>
            </div>
          </li>
        </ul>
        <p className="empty">
          No series connected yet. Chart library and first dataset views land
          when market/filings pipelines start feeding the app.
        </p>
      </section>
    </>
  );
}
