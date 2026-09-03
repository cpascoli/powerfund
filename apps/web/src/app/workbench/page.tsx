import Link from "next/link";

import { MarketCapTreemap } from "@/components/market-cap-treemap";
import { RiskViewPanel } from "@/components/risk-view";
import { getRiskView } from "@/lib/data/risk";
import { getWorkbenchUniverse } from "@/lib/data/workbench";
import {
  isReturnWindow,
  type ReturnWindow,
} from "@/lib/market/returns";
import { isOperator } from "@/lib/auth/operator";
import { getSessionUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ theme?: string; window?: string; view?: string }>;
};

export default async function WorkbenchPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const signedIn = (await getSessionUser()) != null;
  // Risk reads the book — factor exposure, correlation and the capex stress are
  // all computed from open positions. A viewer would get an empty matrix that
  // looks like a fund holding nothing, so the map is the whole surface for them.
  const operator = signedIn && (await isOperator());
  const view = params.view === "risk" && operator ? "risk" : "map";
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

  const risk = view === "risk" ? await getRiskView() : null;

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Workbench</h1>
          <p>
            Comparative views over the research universe. The map sizes by
            market cap
            {operator
              ? "; Risk is the pulled-forward software Phase 3 slice — factor exposure, crowding, correlation, and the capex-pause stress."
              : "."}
          </p>
        </div>
      </header>

      {operator ? (
        <nav className="tab-nav" aria-label="Workbench views">
          <Link
            href="/workbench"
            className={view === "map" ? "is-active" : undefined}
            aria-current={view === "map" ? "page" : undefined}
          >
            Map
          </Link>
          <Link
            href="/workbench?view=risk"
            className={view === "risk" ? "is-active" : undefined}
            aria-current={view === "risk" ? "page" : undefined}
          >
            Risk
          </Link>
        </nav>
      ) : null}

      {view === "map" ? (
        <>
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
          </section>

          <MarketCapTreemap
            names={universe.names}
            themes={universe.themes}
            initialTheme={initialTheme}
            initialWindow={initialWindow}
          />
        </>
      ) : risk ? (
        <RiskViewPanel view={risk} />
      ) : null}
    </>
  );
}
