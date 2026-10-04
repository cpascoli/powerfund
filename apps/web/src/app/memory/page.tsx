import Link from "next/link";

import {
  MEMORY_KINDS,
  buildMemoryStrip,
  groupMemoryByDay,
  isMemoryKind,
  memoryCounts,
  stripIntensity,
  utcDay,
  type MemoryEvent,
  type MemoryKind,
} from "@powerfund/domain";

import { UrlModal } from "@/components/url-modal";
import { loadMemoryTimeline } from "@/lib/data/memory-timeline";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Memory",
  description:
    "Everything Power Fund remembers, on one axis: company dossiers, decisions and their grades, portfolio conclusions, and the dated obligations that trigger the next review.",
};

const KIND_LABEL: Record<MemoryKind, string> = {
  company: "Company",
  decision: "Decision",
  // Every completed review lands here, not only book-level ones: a theme or
  // macro conclusion is a belief the book holds. The kind keeps its name.
  portfolio: "Reviews",
  calendar: "Calendar",
};

/** Why each lane exists, straight from the historical review gate. */
const KIND_BLURB: Record<MemoryKind, string> = {
  company: "What we believe about a name, and every earlier version of that belief",
  decision: "What we decided, on which dossier version, and how it was graded",
  portfolio: "What completed reviews concluded — the memory most often skipped",
  calendar: "What we committed to look at, and when",
};

function parseKinds(raw: string | undefined): MemoryKind[] {
  if (!raw) return [...MEMORY_KINDS];
  const picked = raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(isMemoryKind);
  return picked.length > 0 ? picked : [...MEMORY_KINDS];
}

function href(args: { kinds: MemoryKind[]; symbol?: string; open?: string }): string {
  const params = new URLSearchParams();
  if (args.kinds.length !== MEMORY_KINDS.length) {
    params.set("kind", args.kinds.join(","));
  }
  if (args.symbol) params.set("symbol", args.symbol);
  if (args.open) params.set("open", args.open);
  const query = params.toString();
  return query ? `/memory?${query}` : "/memory";
}

/** Toggling one lane off keeps the rest, so the filter is a set not a radio. */
function toggled(kinds: MemoryKind[], kind: MemoryKind): MemoryKind[] {
  const next = kinds.includes(kind)
    ? kinds.filter((row) => row !== kind)
    : [...kinds, kind];
  return next.length === 0 ? [...MEMORY_KINDS] : next;
}

function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function formatMonth(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "short",
    timeZone: "UTC",
  });
}

type PageProps = {
  searchParams: Promise<{ kind?: string; symbol?: string; open?: string }>;
};

export default async function MemoryPage({ searchParams }: PageProps) {
  const { kind: kindRaw, symbol: symbolRaw, open } = await searchParams;
  const kinds = parseKinds(kindRaw);
  const symbol = symbolRaw?.trim().toUpperCase() || undefined;
  const today = utcDay(new Date().toISOString());

  const { events, details } = await loadMemoryTimeline();
  const filtered = events.filter(
    (event) =>
      kinds.includes(event.kind) && (!symbol || event.symbol === symbol),
  );
  // Memory is what has happened. Dated obligations that have not arrived yet
  // still belong on the page — they are what will trigger the next review — but
  // not interleaved as day groups: 22 of them, mostly one per day, would put
  // fifteen headers between the top of the page and anything the book actually
  // remembers. They also stretch the span to December, which halves the strip's
  // resolution over the five weeks that hold every real memory.
  const past = filtered.filter((event) => !event.future);
  const ahead = filtered
    .filter((event) => event.future)
    .sort((a, b) => a.at.localeCompare(b.at));
  const strip = buildMemoryStrip(past);
  const days = groupMemoryByDay(past);
  const detail = open ? (details.get(open) ?? null) : null;

  const symbols = [
    ...new Set(events.map((row) => row.symbol).filter((row): row is string => !!row)),
  ].sort();

  const counts = memoryCounts(events, symbol);

  return (
    <>
      <section className="panel">
        <h2>Memory</h2>
        <p className="muted">
          The book&apos;s record of what it thought at the time. Every review starts here, so a judgement is
          checked against the beliefs it inherits rather than rebuilt from a
          recent conversation.{" "}
          {symbol
            ? `${counts.inScope} of ${counts.total} memories · filtered to ${symbol}.`
            : `${counts.total} memories.`}
        </p>

        <div className="memory-guide">
          <div>
            <h3>What we believe</h3>
            <p>
              <span className="memory-dot is-company" aria-hidden />
              <strong>Company</strong> — each dossier version. The live dossier
              is today&apos;s view of a name; earlier versions show what we
              believed before and what changed it.
            </p>
            <p>
              <span className="memory-dot is-portfolio" aria-hidden />
              <strong>Reviews</strong> — what completed reviews concluded:
              monthly passes, quarterly reviews, stress diagnostics, theme and
              macro reads. Book-level beliefs often live nowhere else.
            </p>
          </div>
          <div>
            <h3>What we decided</h3>
            <p>
              <span className="memory-dot is-decision" aria-hidden />
              <strong>Decision</strong> — the journal: every enter, add,
              reduce, exit, hold or watch, with its reasoning and the dossier version it
              relied on. Graded at 30, 90 and 180 days on thesis, timing,
              sizing and risk. That is calibration: whether the judgement was
              right, not only the price.
            </p>
          </div>
          <div>
            <h3>What we intend to do</h3>
            <p>
              <span className="memory-dot is-calendar" aria-hidden />
              <strong>Calendar</strong> — dated obligations: earnings,
              catalysts, price conditions, the next monthly or quarterly pass.
              Each one is a promise to look again.
            </p>
            <p className="muted">
              Planned trades wait in the{" "}
              <Link href="/portfolio?tab=queue">deployment queue</Link>, not
              here. A trade enters memory when it is recorded as a decision in
              the journal.
            </p>
          </div>
        </div>

        <p className="muted">
          <strong>How it grows.</strong> A calendar date arrives or new
          evidence lands (a filing, a print, a price trigger). The review loads
          the prior beliefs, states <em>previous belief → new evidence →
          updated belief</em>, and writes the result back: a new dossier
          version, a review conclusion, a decision if we act, and the next
          dated obligation. Grades arrive later and feed the review after that.
          A review that reads only part of this works from a partial record —
          see the{" "}
          <Link href="/docs/gpt-agent-process#historical-review-gate">
            historical review gate
          </Link>{" "}
          in the operating process.
        </p>

        <div className="memory-filters">
          <div className="seg" role="group" aria-label="Memory kind">
            {MEMORY_KINDS.map((row) => (
              <Link
                key={row}
                href={href({ kinds: toggled(kinds, row), symbol })}
                className={kinds.includes(row) ? "is-active" : undefined}
                title={KIND_BLURB[row]}
              >
                <span className={`memory-dot is-${row}`} aria-hidden />
                {KIND_LABEL[row]}
                <span className="memory-count">{counts.byKind[row]}</span>
              </Link>
            ))}
          </div>
          {symbol ? (
            <Link className="memory-clear" href={href({ kinds })}>
              Clear {symbol}
            </Link>
          ) : null}
        </div>

        {strip.buckets.length > 0 ? (
          <div className="memory-strip" aria-hidden>
            <div className="memory-strip-lanes">
              {MEMORY_KINDS.filter((row) => kinds.includes(row)).map((row) => (
                <div key={row} className="memory-strip-lane">
                  <span className="memory-strip-label">{KIND_LABEL[row]}</span>
                  <div className="memory-strip-track">
                    {strip.buckets.map((bucket) => {
                      const count = bucket.counts[row];
                      const target = bucket.firstDay[row];
                      const label = `${bucket.date}${
                        bucket.endDate !== bucket.date ? ` → ${bucket.endDate}` : ""
                      }: ${count} ${KIND_LABEL[row].toLowerCase()}`;
                      const style = {
                        opacity: count === 0 ? 0.07 : 0.25 + 0.75 * stripIntensity(count, strip.peak),
                      };
                      // Only a day with memories has a section to scroll to;
                      // an empty cell is a gap to see, not a link.
                      return target ? (
                        <a
                          key={`${row}-${bucket.date}`}
                          href={`#day-${target}`}
                          className={`memory-strip-cell is-${row}`}
                          style={style}
                          title={label}
                        />
                      ) : (
                        <span
                          key={`${row}-${bucket.date}`}
                          className={`memory-strip-cell is-${row}`}
                          style={style}
                          title={label}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="memory-strip-axis">
              {strip.buckets.map((bucket, index) => {
                const showMonth =
                  index === 0 ||
                  formatMonth(bucket.date) !==
                    formatMonth(strip.buckets[index - 1]!.date);
                return (
                  <span key={bucket.date} className="memory-strip-tick">
                    {showMonth ? formatMonth(bucket.date) : ""}
                  </span>
                );
              })}
            </div>
          </div>
        ) : null}

        {symbols.length > 0 ? (
          <details className="memory-symbols">
            <summary>Filter to one name</summary>
            <div className="memory-symbol-row">
              {symbols.map((row) => (
                <Link
                  key={row}
                  href={href({ kinds, symbol: row === symbol ? undefined : row })}
                  className={row === symbol ? "is-active" : undefined}
                >
                  {row}
                </Link>
              ))}
            </div>
          </details>
        ) : null}
      </section>

      {ahead.length > 0 ? (
        <section className="panel memory-ahead" aria-label="Upcoming obligations">
          <div className="memory-day-head">
            <h3>Ahead</h3>
            <span className="muted">
              {ahead.length} dated {ahead.length === 1 ? "obligation" : "obligations"} · each one triggers a review
            </span>
          </div>
          <ul className="memory-ahead-list">
            {ahead.map((event) => (
              <li key={event.id}>
                <Link href={href({ kinds, symbol, open: event.id })}>
                  <span className="memory-ahead-date">
                    {formatDay(utcDay(event.at))}
                  </span>
                  <span className={`memory-dot is-${event.kind}`} aria-hidden />
                  <span className="memory-ahead-title">{event.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="panel" aria-label="Memory timeline">
        {days.length === 0 ? (
          <p className="empty">No memories match these filters.</p>
        ) : (
          days.map((group) => {
            return (
              <div key={group.date} className="memory-day" id={`day-${group.date}`}>
                <div className="memory-day-head">
                  <h3>{formatDay(group.date)}</h3>
                  <span className="muted">
                    {group.date === today ? "today · " : ""}
                    {group.events.length}{" "}
                    {group.events.length === 1 ? "memory" : "memories"}
                  </span>
                </div>
                <ul className="memory-list">
                  {group.events.map((event) => (
                    <MemoryRow
                      key={event.id}
                      event={event}
                      href={href({ kinds, symbol, open: event.id })}
                    />
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </section>

      {detail ? (
        <UrlModal
          key={detail.id}
          size="wide"
          title={detail.title}
          closeHref={href({ kinds, symbol })}
          eyebrow={
            <span className={`memory-kind is-${detail.kind}`}>
              {KIND_LABEL[detail.kind]}
            </span>
          }
        >
          <p className="memory-detail-meta muted">
            {formatDay(utcDay(detail.at))}
            {detail.symbol ? ` · ${detail.symbol}` : ""}
          </p>
          <dl className="memory-fields">
            {detail.fields.map((field) => (
              <div key={field.label}>
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
          {detail.href ? (
            <footer className="memory-detail-footer">
              <Link href={detail.href}>{detail.hrefLabel}</Link>
            </footer>
          ) : null}
        </UrlModal>
      ) : null}
    </>
  );
}

function MemoryRow({ event, href }: { event: MemoryEvent; href: string }) {
  return (
    <li className={`memory-item is-${event.kind}${event.future ? " is-ahead" : ""}`}>
      <Link href={href}>
        <span className={`memory-dot is-${event.kind}`} aria-hidden />
        <span className="memory-item-kind">{KIND_LABEL[event.kind]}</span>
        <span className="memory-item-title">
          {event.title}
          {event.badge ? <em className="memory-badge">{event.badge}</em> : null}
        </span>
        <span className="memory-item-summary">{event.summary ?? "—"}</span>
      </Link>
    </li>
  );
}
