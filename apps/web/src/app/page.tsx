import type { ReactNode } from "react";
import Link from "next/link";
import { RISK_DEFAULTS } from "@powerfund/domain";

import {
  attentionKindLabel,
  bookPulse,
  buildAttentionItems,
  isUrgentAttention,
  themePulse,
  upcomingDayGroups,
  upcomingSections,
  type AttentionItem,
  type UpcomingDayGroup,
  type UpcomingItem,
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
  listThemes,
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

type BriefingTabId = "attention" | "upcoming" | "themes";

const TABS: Array<{ id: BriefingTabId; label: string }> = [
  { id: "attention", label: "Attention" },
  { id: "upcoming", label: "Upcoming" },
  { id: "themes", label: "Themes" },
];

function parseTab(raw: string | undefined): BriefingTabId | null {
  switch (raw) {
    case "attention":
    case "upcoming":
    case "themes":
      return raw;
    default:
      return null;
  }
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
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab = parseTab(tab) ?? "attention";

  const [
    themes,
    instruments,
    book,
    rawQueue,
    snapshots,
    flows,
    decisions,
    dossiers,
    reviews,
  ] = await Promise.all([
    listThemes(),
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
  const themesView = themePulse({ themes, instruments, book });
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
    case "attention":
      tabContent = <AttentionPanel items={attention} />;
      break;
    case "upcoming":
      tabContent = <UpcomingPanel sections={upcoming} />;
      break;
    case "themes":
      tabContent = (
        <ThemesPanel
          themes={themesView}
          aiCapexPctNav={pulse.aiCapexPctNav}
        />
      );
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
            Flags, reviews due, and dated actions — including reviews that are
            still ahead
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
            title={`Kill-switch at ${RISK_DEFAULTS.drawdownKillSwitchPct}% of deployed capital from peak`}
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
              href={entry.id === "attention" ? "/" : `/?tab=${entry.id}`}
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
                <strong>
                  <Link href={item.href}>{item.title}</Link>
                </strong>
                <div className="muted">{item.detail}</div>
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

function UpcomingPanel({
  sections,
}: {
  sections: ReturnType<typeof upcomingSections>;
}) {
  const hasAny = sections.some((section) => section.items.length > 0);
  return (
    <section className="panel" aria-label="Upcoming">
      <h2>Upcoming</h2>
      <p className="muted">
        A dated agenda of review obligations and queued trades. Reviews are not
        fills; the deployment list stays on the{" "}
        <Link href="/portfolio?tab=queue">queue</Link>.
      </p>
      {hasAny ? (
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
            {sections.map((section) =>
              section.items.length === 0 ? null : (
                <AgendaSection
                  key={section.id}
                  label={section.label}
                  items={section.items}
                  showMonths={section.id === "later"}
                />
              ),
            )}
          </tbody>
        </table>
      ) : (
        <p className="empty">
          Nothing dated in the queue or review calendar. Plan buys from the{" "}
          <Link href="/portfolio?tab=queue">deployment queue</Link>.
        </p>
      )}
    </section>
  );
}

function AgendaSection({
  label,
  items,
  showMonths,
}: {
  label: string;
  items: UpcomingItem[];
  showMonths: boolean;
}) {
  const days = upcomingDayGroups(items);
  let lastMonth = "";
  return (
    <>
      <tr className="agenda-section-row">
        <td colSpan={4}>{label}</td>
      </tr>
      {days.flatMap((day) => {
        const nodes: ReactNode[] = [];
        if (showMonths && day.monthLabel && day.monthLabel !== lastMonth) {
          lastMonth = day.monthLabel;
          nodes.push(
            <tr key={`${label}-${day.monthLabel}`} className="agenda-month">
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
                <strong>
                  <Link href={row.href}>{row.title}</Link>
                </strong>
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

function ThemesPanel({
  themes,
  aiCapexPctNav,
}: {
  themes: ReturnType<typeof themePulse>;
  aiCapexPctNav: number | null;
}) {
  const factorHot =
    aiCapexPctNav != null &&
    aiCapexPctNav > RISK_DEFAULTS.maxAiCapexFactorPctNav;

  return (
    <section className="panel" aria-label="Theme pulse">
      <h2>Themes</h2>
      <p className="muted">
        AI-capex complex {pct(aiCapexPctNav)} of NAV (cap{" "}
        {RISK_DEFAULTS.maxAiCapexFactorPctNav}%)
        {factorHot ? <span className="tag warn-tag"> over cap</span> : null}.
        Memory/storage names are a sleeve inside that complex (guide{" "}
        {RISK_DEFAULTS.maxAiMemorySleevePctNav}%). Weights vs the{" "}
        {RISK_DEFAULTS.maxThemePctNav}% theme cap. Coverage is watchlist vs
        names on the book.
      </p>
      <ul className="list">
        {themes.map((theme) => (
          <li key={theme.slug}>
            <div>
              <strong>
                <Link href={`/themes#${theme.slug}`}>{theme.name}</Link>
              </strong>
              {theme.isCore ? <span className="tag"> core</span> : null}
              {theme.description ? (
                <div className="muted">{theme.description}</div>
              ) : null}
              <div className="muted">
                {theme.watchlistCount} watchlist · {theme.bookCount} on book
                {" · "}
                <Link href={`/workbench?theme=${theme.slug}`}>Workbench</Link>
              </div>
            </div>
            <span className={theme.overCap ? "tag warn-tag" : "tag"}>
              {pct(theme.weightPctNav)} NAV
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
