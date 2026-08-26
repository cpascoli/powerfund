import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { CORE_THEMES } from "@powerfund/domain";

const CORE_ONLY = CORE_THEMES.filter((theme) => theme.isCore);

function EssayBlock({
  kicker,
  title,
  src,
  alt,
  width,
  height,
  media,
  shape = "landscape",
  children,
}: {
  kicker: string;
  title: string;
  src: string;
  alt: string;
  width: number;
  height: number;
  media: "start" | "end";
  shape?: "landscape" | "compact" | "wide" | "portrait";
  children: ReactNode;
}) {
  return (
    <section className={`landing-section media-${media} shape-${shape}`}>
      <div className="landing-plate">
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          sizes="(max-width: 900px) 92vw, 28vw"
        />
      </div>
      <div className="landing-copy">
        <p className="landing-kicker">{kicker}</p>
        <h2>{title}</h2>
        {children}
      </div>
    </section>
  );
}

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

      <div className="landing-sections">
        <EssayBlock
          kicker="01"
          title="What it is"
          src="/landing/paper-loop.jpg"
          alt="A hand closing a loop of overlapping paper sheets"
          width={1280}
          height={853}
          media="start"
        >
          <p>
            Not a black-box trading bot. A research, decision, and risk platform
            that records theses, actions, and outcomes so the process can improve
            — with a human in the loop for live capital.
          </p>
        </EssayBlock>

        <EssayBlock
          kicker="02"
          title="Why it exists"
          src="/landing/ahead.jpg"
          alt="One sharp point of light standing ahead of a field of faint lights"
          width={1280}
          height={853}
          media="end"
        >
          <p>
            Find, evaluate, size, and manage opportunities before they become
            consensus trades. Capital preservation is a hard constraint. High
            growth is the objective when the opportunity set justifies it. The job
            is to find 2028 winners in 2026.
          </p>
        </EssayBlock>

        <EssayBlock
          kicker="03"
          title="Goals"
          src="/landing/compass.jpg"
          alt="A compass that has drawn the same circle twice on paper"
          width={1280}
          height={853}
          media="start"
          shape="compact"
        >
          <p>
            Prove a repeatable process on personal capital: a written mandate that
            is actually followed, decision-grade dossiers, and honest labels —
            early only when price has not already discounted the evidence.
            Performance is judged against the S&amp;P 500 and QQQ. Outside capital
            comes later, if ever, after the track record exists.
          </p>
        </EssayBlock>

        <EssayBlock
          kicker="04"
          title="How we go about it"
          src="/landing/four-stages.jpg"
          alt="Four overlapping glass sheets in sequence, joined by a single line"
          width={1280}
          height={853}
          media="end"
          shape="wide"
        >
          <p>
            Ingest prices, filings, and thematic signals. Organize the universe by
            the four linked themes. Write a thesis with invalidation before sizing.
            Journal the decision, then review the outcome. Charts live in the
            market map; capital decisions stay in the operator book.
          </p>
        </EssayBlock>

        <EssayBlock
          kicker="05"
          title="How we think about investing"
          src="/landing/concentrate.jpg"
          alt="Sand concentrating through the narrow waist of a glass hourglass"
          width={853}
          height={1280}
          media="start"
          shape="portrait"
        >
          <p>
            Early means evidence accumulating before consensus pricing — not
            obscure lottery tickets. Search for companies that control a bottleneck
            whose economics are changing faster than perception. Survive being
            wrong; size for asymmetry. Every actionable signal should be
            inspectable. Ingest widely; concentrate on the mandate. Process, review,
            and risk rules compound; vibes do not.
          </p>
        </EssayBlock>
      </div>

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
