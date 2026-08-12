import { MarketCapTreemap } from "@/components/market-cap-treemap";
import { getWorkbenchUniverse } from "@/lib/data/workbench";
import {
  isReturnWindow,
  type ReturnWindow,
} from "@/lib/market/returns";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ theme?: string; window?: string }>;
};

export default async function WorkbenchPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const universe = await getWorkbenchUniverse();
  const initialTheme =
    params.theme &&
    (params.theme === "all" ||
      universe.themes.some((theme) => theme.slug === params.theme))
      ? params.theme
      : "all";
  const initialWindow: ReturnWindow = isReturnWindow(params.window ?? "")
    ? (params.window as ReturnWindow)
    : "3m";

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Workbench</h1>
          <p>
            Comparative views over the research universe. Start with the market
            map — size is market cap, color is period return.
          </p>
        </div>
      </header>

      <section className="stat-row" aria-label="Workbench summary">
        <div className="stat">
          <span>Names mapped</span>
          <strong>{universe.names.length}</strong>
        </div>
        <div className="stat">
          <span>Themes</span>
          <strong>{universe.themes.length}</strong>
        </div>
        <div className="stat">
          <span>Default window</span>
          <strong>3M</strong>
        </div>
        <div className="stat">
          <span>Saved views</span>
          <strong>Soon</strong>
        </div>
      </section>

      <MarketCapTreemap
        names={universe.names}
        themes={universe.themes}
        initialTheme={initialTheme}
        initialWindow={initialWindow}
      />
    </>
  );
}
