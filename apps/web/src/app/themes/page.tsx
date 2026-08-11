import Link from "next/link";

import {
  listInstrumentsWithThemes,
  listThemes,
} from "@/lib/data/research";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Themes",
};

export default async function ThemesPage() {
  const [themes, instruments] = await Promise.all([
    listThemes(),
    listInstrumentsWithThemes(),
  ]);

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Themes</h1>
          <p>
            Concentration buckets for research and risk. Prefer starting from{" "}
            <Link href="/explore">Explore</Link>.
          </p>
        </div>
      </header>

      <div className="grid">
        {themes.map((theme) => {
          const themeInstruments = instruments.filter(
            (instrument) => instrument.theme_slug === theme.slug,
          );

          return (
            <section className="panel half" key={theme.id} id={theme.slug}>
              <h2>
                {theme.name}{" "}
                <span className="tag">{theme.is_core ? "core" : "explore"}</span>
              </h2>
              <p>{theme.description}</p>
              {themeInstruments.length === 0 ? (
                <p className="empty">No instruments linked yet.</p>
              ) : (
                <ul className="list">
                  {themeInstruments.map((instrument) => (
                    <li key={instrument.id}>
                      <div>
                        <strong>
                          <Link href={`/explore/${instrument.symbol}`}>
                            {instrument.symbol}
                          </Link>
                        </strong>
                        <div className="muted">{instrument.name}</div>
                      </div>
                      <span className="tag">
                        {instrument.has_dossier
                          ? "dossier"
                          : instrument.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
