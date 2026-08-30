import Link from "next/link";

import { ExploreCatalog } from "@/components/explore-catalog";
import { getExploreCatalog } from "@/lib/data/explore";
import {
  parseExploreFocus,
  parseExploreTheme,
} from "@/lib/data/explore-catalog";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Explore",
};

type PageProps = {
  searchParams: Promise<{ theme?: string; focus?: string; q?: string }>;
};

export default async function ExplorePage({ searchParams }: PageProps) {
  const { theme, focus, q } = await searchParams;
  const catalog = await getExploreCatalog();

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Explore</h1>
          <p>
            Research universe by theme. Coverage gaps and stale notes live on{" "}
            <Link href="/briefing?tab=research">Briefing Research</Link>. Open a
            name for the dossier; compare charts in Workbench.
          </p>
        </div>
      </header>

      <ExploreCatalog
        themes={catalog.themes}
        names={catalog.names}
        initialTheme={parseExploreTheme(theme, catalog.themes)}
        initialFocus={parseExploreFocus(focus)}
        initialQuery={q?.trim() ?? ""}
      />
    </>
  );
}
