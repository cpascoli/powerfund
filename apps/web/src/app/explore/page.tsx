import Link from "next/link";

import {
  listInstrumentsWithThemes,
  listThemes,
} from "@/lib/data/research";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Explore",
};

export default async function ExplorePage() {
  const [themes, instruments] = await Promise.all([
    listThemes(),
    listInstrumentsWithThemes(),
  ]);

  const counts = new Map<string, number>();
  for (const instrument of instruments) {
    counts.set(
      instrument.theme_slug,
      (counts.get(instrument.theme_slug) ?? 0) + 1,
    );
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Explore</h1>
          <p>
            Research universe by theme. Drill into names here; open-ended charts
            belong in Workbench.
          </p>
        </div>
      </header>

      <section className="panel">
        <h2>Theme map</h2>
        <ul className="list">
          {themes.map((theme) => (
            <li key={theme.id}>
              <div>
                <strong>
                  <Link href={`/themes#${theme.slug}`}>{theme.name}</Link>
                </strong>
                <div className="muted">{theme.description}</div>
              </div>
              <span className="tag">
                {counts.get(theme.slug) ?? 0} names
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Watchlist</h2>
        {instruments.length === 0 ? (
          <p className="empty">
            No instruments yet. Run <code>pnpm db:reset</code> to seed the
            starter universe.
          </p>
        ) : (
          <ul className="list">
            {instruments.map((instrument) => (
              <li key={instrument.id}>
                <div>
                  <strong>
                    <Link href={`/explore/${instrument.symbol}`}>
                      {instrument.symbol}
                    </Link>{" "}
                    <span className="muted">{instrument.name}</span>
                  </strong>
                  <div className="muted">
                    {instrument.theme_name}
                    {instrument.notes ? ` · ${instrument.notes}` : ""}
                  </div>
                </div>
                <span className="tag">
                  {instrument.has_dossier ? "dossier" : instrument.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
