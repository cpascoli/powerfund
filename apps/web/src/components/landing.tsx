import Link from "next/link";
import Image from "next/image";
import { CORE_THEMES } from "@powerfund/domain";

const CORE_ONLY = CORE_THEMES.filter((theme) => theme.isCore);

export function Landing() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="hero-eyebrow">Power Fund</p>
          <h1>Investment intelligence for AI, energy, robotics, and defence.</h1>
          <p className="hero-lede">
            We manage and grow capital across those four themes as one
            industrial transformation: a massive increase in the economic value
            of computation, electricity, and autonomous machines.
          </p>
          <div className="hero-actions">
            <Link className="buttonish" href="/explore">
              Browse the universe
            </Link>
            <Link className="buttonish subtle" href="/docs/goals">
              Read the playbook
            </Link>
          </div>
        </div>
        <div className="hero-media">
          <Image
            src="/hero.jpg"
            alt="A sunlit research campus beside water and clean energy, suggesting considered technology and calm"
            width={1536}
            height={1024}
            priority
            sizes="(max-width: 900px) 100vw, 44vw"
          />
        </div>
      </section>

      <ul className="theme-strip" aria-label="Core themes">
        {CORE_ONLY.map((theme) => (
          <li key={theme.slug}>
            <Link href={`/explore?theme=${theme.slug}`}>
              <strong>{theme.name}</strong>
              <span>{theme.description}</span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="landing-section">
        <h2>What it is</h2>
        <p>
          Not a black-box trading bot. A research, decision, and risk platform
          that records theses, actions, and outcomes so the process can improve
          — with a human in the loop for live capital.
        </p>
      </section>

      <section className="landing-section">
        <h2>Why it exists</h2>
        <p>
          Find, evaluate, size, and manage opportunities before they become
          consensus trades. Capital preservation is a hard constraint. High
          growth is the objective when the opportunity set justifies it. The job
          is to find 2028 winners in 2026.
        </p>
      </section>

      <section className="landing-section">
        <h2>Goals</h2>
        <p>
          Prove a repeatable process on personal capital: a written mandate that
          is actually followed, decision-grade dossiers, and honest labels —
          early only when price has not already discounted the evidence.
          Performance is judged against the S&amp;P 500 and QQQ. Outside capital
          comes later, if ever, after the track record exists.
        </p>
      </section>

      <section className="landing-section">
        <h2>How we go about it</h2>
        <p>
          Ingest prices, filings, and thematic signals. Organize the universe by
          the four linked themes. Write a thesis with invalidation before sizing.
          Journal the decision, then review the outcome. Charts live in the
          market map; capital decisions stay in the operator book.
        </p>
      </section>

      <section className="landing-section">
        <h2>How we think about investing</h2>
        <p>
          Early means evidence accumulating before consensus pricing — not
          obscure lottery tickets. Search for companies that control a bottleneck
          whose economics are changing faster than perception. Survive being
          wrong; size for asymmetry. Every actionable signal should be
          inspectable. Ingest widely; concentrate on the mandate. Process, review,
          and risk rules compound; vibes do not.
        </p>
      </section>

      <section className="landing-browse" aria-label="Start browsing">
        <h2>Look around</h2>
        <div className="browse-grid">
          <Link className="browse-card" href="/explore">
            <strong>Watchlist</strong>
            <span>Names by theme, with dossiers and research status.</span>
          </Link>
          <Link className="browse-card" href="/workbench">
            <strong>Market map</strong>
            <span>Heatmap of the universe, sized by market cap.</span>
          </Link>
          <Link className="browse-card" href="/calendar">
            <strong>Calendar</strong>
            <span>Earnings and known events we keep on the agenda.</span>
          </Link>
          <Link className="browse-card" href="/docs/mandate">
            <strong>Mandate</strong>
            <span>Risk rules, cash, and how decisions get made.</span>
          </Link>
        </div>
      </section>
    </>
  );
}
