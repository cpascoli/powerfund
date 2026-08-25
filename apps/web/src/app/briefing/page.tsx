import type { ReactNode } from "react";
import Link from "next/link";
import { RISK_DEFAULTS } from "@powerfund/domain";

import {
  attentionKindLabel,
  bookPulse,
  buildAttentionItems,
  filterUpcomingItems,
  flattenUpcomingItems,
  isUrgentAttention,
  parseUpcomingHorizonFilter,
  parseUpcomingKindFilter,
  upcomingDayGroups,
  upcomingSections,
  type AttentionItem,
  type ReviewSubjectLink,
  type UpcomingDayGroup,
  type UpcomingHorizonFilter,
  type UpcomingItem,
  type UpcomingKindFilter,
} from "@/lib/data/briefing";
import { listDecisions } from "@/lib/data/decisions";
import {
  buildDeploymentQueue,
  listOpenPlannedActions,
} from "@/lib/data/planned-actions";
import { getOpenPortfolioBook, withLiveMarks } from "@/lib/data/portfolio";
import {
  listDossierReviews,
  listInstrumentsWithThemes,
} from "@/lib/data/research";
import { listOpenReviewTasks } from "@/lib/data/reviews";
import {
  computeDrawdown,
  listLedgerFlows,
  listPortfolioSnapshots,
  snapshotFlags,
} from "@/lib/data/snapshots";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Briefing",
};

type BriefingTabId = "upcoming" | "attention";

const TABS: Array<{ id: BriefingTabId; label: string }> = [
  { id: "upcoming", label: "Upcoming" },
  { id: "attention", label: "Attention" },
];

const KIND_FILTERS: Array<{ id: UpcomingKindFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "review", label: "Reviews" },
  { id: "planned", label: "Planned" },
];

const HORIZON_FILTERS: Array<{ id: UpcomingHorizonFilter; label: string }> = [
  { id: "this_week", label: "This week" },
  { id: "this_month", label: "This month" },
  { id: "next_month", label: "Next month" },
  { id: "later", label: "Later" },
];

function parseTab(raw: string | undefined): BriefingTabId | null {
  switch (raw) {
    case "attention":
    case "upcoming":
      return raw;
    default:
      return null;
  }
}

function briefingHref(args: {
  tab?: BriefingTabId;
  kind?: UpcomingKindFilter;
  when?: UpcomingHorizonFilter;
}): string {
  if (args.tab === "attention") return "/briefing?tab=attention";
  const params = new URLSearchParams();
  if (args.kind && args.kind !== "all") params.set("kind", args.kind);
  if (args.when && args.when !== "this_week") params.set("when", args.when);
  const query = params.toString();
  return query.length > 0 ? `/briefing?${query}` : "/briefing";
}

function pct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function money(value: number): string {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function weekdayCaption(day: UpcomingDayGroup): string {
  if (day.isToday) return "Today";
  if (day.isTomorrow) return "Tomorrow";
  return day.weekday;
}

export default async function BriefingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; kind?: string; when?: string }>;
}) {
  const { tab, kind: kindRaw, when: whenRaw } = await searchParams;
  const activeTab = parseTab(tab) ?? "upcoming";
  const kind = parseUpcomingKindFilter(kindRaw);
  const horizon = parseUpcomingHorizonFilter(whenRaw);

  const [
    instruments,
    book,
    rawQueue,
    snapshots,
    flows,
    decisions,
    dossiers,
    reviews,
  ] = await Promise.all([
    listInstrumentsWithThemes(),
    getOpenPortfolioBook().then(withLiveMarks),
    listOpenPlannedActions(),
    listPortfolioSnapshots(),
    listLedgerFlows(),
    listDecisions(),
    listDossierReviews(),
    listOpenReviewTasks(),
  ]);

  const queue = buildDeploymentQueue(book, instruments, rawQueue);
  const drawdown = computeDrawdown(
    snapshots,
    {
      nav: book.nav,
      invested: book.invested,
      positionsValue: book.marketValue,
      asOf: book.markAsOf ?? new Date().toISOString(),
    },
    flows,
  );
  const bookFlags = [...snapshotFlags(snapshots, drawdown), ...book.flags];
  const attention = buildAttentionItems({
    bookFlags,
    queueFlags: queue.flags,
    queue: queue.actions,
    book,
    decisions,
    dossiers,
    instruments,
    reviews,
  });
  const upcoming = upcomingSections(queue.actions, reviews);
  const upcomingItems = filterUpcomingItems(
    flattenUpcomingItems(upcoming),
    kind,
    horizon,
  );
  const pulse = bookPulse(book);
  const thisWeekCount = upcoming[0]?.items.length ?? 0;
  const attentionWarn = attention.some((item) => isUrgentAttention(item.kind));

  const markAsOf = book.markAsOf
    ? new Date(book.markAsOf).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : null;

  let tabContent: ReactNode;
  switch (activeTab) {
    case "upcoming":
      tabContent = (
        <UpcomingPanel
          items={upcomingItems}
          kind={kind}
          horizon={horizon}
        />
      );
      break;
    case "attention":
      tabContent = <AttentionPanel items={attention} />;
      break;
    default: {
      const _exhaustive: never = activeTab;
      tabContent = _exhaustive;
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Briefing</h1>
          <p>
            Dated reviews and queued trades, then flags that need a decision
            {markAsOf
              ? ` — ${book.markLabel.toLowerCase()} as of ${markAsOf}. `
              : ` — ${book.markLabel.toLowerCase()}. `}
            Deep charts live in <Link href="/workbench">Workbench</Link>;
            browsing starts in <Link href="/explore">Explore</Link>.
          </p>
        </div>
      </header>

      <section className="stat-row stats-5" aria-label="Book pulse">
        <div className="stat">
          <span>NAV</span>
          <strong>{money(book.nav)}</strong>
        </div>
        <div className="stat">
          <span>Cash vs {RISK_DEFAULTS.minCashPctNav}%</span>
          <strong
            className={
              book.cashPctNav < RISK_DEFAULTS.minCashPctNav
                ? "is-down"
                : undefined
            }
          >
            {pct(book.cashPctNav)}
          </strong>
        </div>
        <div className="stat">
          <span>
            Largest
            {pulse.largest ? ` ${pulse.largest.symbol}` : ""} vs{" "}
            {RISK_DEFAULTS.maxPositionPctNav}%
          </span>
          <strong
            className={
              pulse.largest != null &&
              pulse.largest.weightPctNav > RISK_DEFAULTS.maxPositionPctNav
                ? "is-down"
                : undefined
            }
          >
            {pct(pulse.largest?.weightPctNav)}
          </strong>
        </div>
        <div className="stat">
          <span>AI-capex vs {RISK_DEFAULTS.maxAiCapexFactorPctNav}%</span>
          <strong
            className={
              pulse.aiCapexPctNav != null &&
              pulse.aiCapexPctNav > RISK_DEFAULTS.maxAiCapexFactorPctNav
                ? "is-down"
                : undefined
            }
          >
            {pct(pulse.aiCapexPctNav)}
          </strong>
        </div>
        <div className="stat">
          <span>Drawdown vs {RISK_DEFAULTS.drawdownKillSwitchPct}%</span>
          <strong
            className={
              drawdown.killSwitchBreached
                ? "is-down"
                : (drawdown.deployedDrawdownPp ?? 0) > 0
                  ? undefined
                  : "is-up"
            }
            title={
              drawdown.killSwitchBlocksNewRisk
                ? `${RISK_DEFAULTS.drawdownKillSwitchPct}% deployed-sleeve diagnostic after Phase 1 — new buys halt until review`
                : `${RISK_DEFAULTS.drawdownKillSwitchPct}% deployed-sleeve diagnostic; Phase 1 does not halt new buys`
            }
          >
            {drawdown.deployedDrawdownPp == null
              ? "—"
              : pct(drawdown.deployedDrawdownPp)}
          </strong>
        </div>
      </section>

      <nav className="tab-nav" aria-label="Briefing sections">
        {TABS.map((entry) => {
          const badge =
            entry.id === "attention"
              ? attention.length
              : entry.id === "upcoming"
                ? thisWeekCount
                : null;
          const warn = entry.id === "attention" && attentionWarn;
          return (
            <Link
              key={entry.id}
              href={
                entry.id === "upcoming"
                  ? briefingHref({ kind, when: horizon })
                  : briefingHref({ tab: "attention" })
              }
              className={entry.id === activeTab ? "is-active" : undefined}
              aria-current={entry.id === activeTab ? "page" : undefined}
            >
              {entry.label}
              {badge != null && badge > 0 ? (
                <span className="tab-badge">{badge}</span>
              ) : null}
              {warn ? <span className="tab-badge warn">!</span> : null}
            </Link>
          );
        })}
      </nav>

      {tabContent}
    </>
  );
}

function EventTitle({
  title,
  href,
}: {
  title: string;
  href: string | null;
}) {
  if (href) {
    return (
      <strong>
        <Link href={href}>{title}</Link>
      </strong>
    );
  }
  return <strong>{title}</strong>;
}

function SubjectLinks({ subjects }: { subjects: ReviewSubjectLink[] }) {
  if (subjects.length === 0) return null;
  return (
    <div className="muted event-subjects">
      {subjects.map((subject, index) => (
        <span key={`${subject.label}-${subject.href ?? index}`}>
          {index > 0 ? " · " : null}
          {subject.href ? (
            <Link href={subject.href}>{subject.label}</Link>
          ) : (
            subject.label
          )}
        </span>
      ))}
    </div>
  );
}

function AttentionPanel({ items }: { items: AttentionItem[] }) {
  return (
    <section className="panel" aria-label="Needs attention">
      <h2>Needs attention</h2>
      {items.length === 0 ? (
        <p className="empty">
          Nothing needs attention. Mandate checks are clear. Dated actions and
          upcoming reviews are on Upcoming; browse names in{" "}
          <Link href="/explore">Explore</Link>.
        </p>
      ) : (
        <ul className="list">
          {items.map((item) => (
            <li key={item.id}>
              <div>
                <EventTitle title={item.title} href={item.href} />
                <SubjectLinks subjects={item.subjects ?? []} />
                {item.instructions ? (
                  <div className="muted event-instructions">
                    {item.instructions}
                  </div>
                ) : null}
                {item.detail ? (
                  <div className="muted">{item.detail}</div>
                ) : null}
              </div>
              <span
                className={
                  isUrgentAttention(item.kind) ? "tag warn-tag" : "tag"
                }
              >
                {attentionKindLabel(item.kind)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function upcomingEmptyCopy(
  kind: UpcomingKindFilter,
  horizon: UpcomingHorizonFilter,
): string {
  const when =
    horizon === "this_week"
      ? "this week"
      : horizon === "this_month"
        ? "this month"
        : horizon === "next_month"
          ? "next month"
          : "later";
  switch (kind) {
    case "review":
      return `No review obligations ${when}.`;
    case "planned":
      return `No planned trades ${when}.`;
    case "all":
      return `Nothing dated ${when}.`;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  hrefFor,
}: {
  label: string;
  value: T;
  options: Array<{ id: T; label: string }>;
  hrefFor: (id: T) => string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((option) => (
        <Link
          key={option.id}
          href={hrefFor(option.id)}
          className={option.id === value ? "is-active" : undefined}
          aria-current={option.id === value ? "page" : undefined}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}

function UpcomingPanel({
  items,
  kind,
  horizon,
}: {
  items: UpcomingItem[];
  kind: UpcomingKindFilter;
  horizon: UpcomingHorizonFilter;
}) {
  const showMonths = horizon !== "this_week";
  return (
    <section className="panel" aria-label="Upcoming">
      <h2>Upcoming</h2>
      <p className="muted">
        A dated agenda of review obligations and queued trades. Reviews are not
        fills; the deployment list stays on the{" "}
        <Link href="/portfolio?tab=queue">queue</Link>.
      </p>
      <div className="upcoming-filters">
        <SegmentedControl
          label="Event type"
          value={kind}
          options={KIND_FILTERS}
          hrefFor={(next) => briefingHref({ kind: next, when: horizon })}
        />
        <SegmentedControl
          label="When"
          value={horizon}
          options={HORIZON_FILTERS}
          hrefFor={(next) => briefingHref({ kind, when: next })}
        />
      </div>
      {items.length > 0 ? (
        <table className="agenda">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">UTC</th>
              <th scope="col">Event</th>
              <th scope="col">Type</th>
            </tr>
          </thead>
          <tbody>
            <AgendaSection items={items} showMonths={showMonths} />
          </tbody>
        </table>
      ) : (
        <p className="empty">
          {upcomingEmptyCopy(kind, horizon)}{" "}
          {kind !== "review" ? (
            <Link href="/portfolio?tab=queue">Open the queue</Link>
          ) : null}
        </p>
      )}
    </section>
  );
}

function AgendaSection({
  items,
  showMonths,
}: {
  items: UpcomingItem[];
  showMonths: boolean;
}) {
  const days = upcomingDayGroups(items);
  let lastMonth = "";
  return (
    <>
      {days.flatMap((day) => {
        const nodes: ReactNode[] = [];
        if (showMonths && day.monthLabel && day.monthLabel !== lastMonth) {
          lastMonth = day.monthLabel;
          nodes.push(
            <tr key={`${day.date ?? "none"}-month`} className="agenda-month">
              <td colSpan={4}>{day.monthLabel}</td>
            </tr>,
          );
        }
        day.rows.forEach((row, index) => {
          nodes.push(
            <tr
              key={row.key}
              className={day.isToday ? "is-today" : undefined}
            >
              <td className="agenda-date">
                {index === 0 ? (
                  <>
                    <strong>{day.dayMonth}</strong>
                    <span>{weekdayCaption(day)}</span>
                  </>
                ) : null}
              </td>
              <td className="agenda-time">{row.time ?? "—"}</td>
              <td>
                <EventTitle title={row.title} href={row.href} />
                <SubjectLinks subjects={row.subjects} />
                {row.instructions ? (
                  <div className="muted event-instructions">
                    {row.instructions}
                  </div>
                ) : null}
                {row.detail ? <div className="muted">{row.detail}</div> : null}
              </td>
              <td className="agenda-kind">
                <span
                  className={
                    row.kind === "planned_action" ? "tag warn-tag" : "tag"
                  }
                >
                  {row.kindLabel}
                </span>
              </td>
            </tr>,
          );
        });
        return nodes;
      })}
    </>
  );
}
