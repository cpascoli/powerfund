import Link from "next/link";
import { RISK_DEFAULTS } from "@powerfund/domain";

import { CashEntryForm } from "@/components/cash-entry-form";
import { ConfirmFillForm } from "@/components/confirm-fill-form";
import { LiveMarksRefresh } from "@/components/live-marks-refresh";
import { NavHistoryChart } from "@/components/nav-history-chart";
import { PlannedActionForm } from "@/components/planned-action-form";
import { PortfolioSectionTabs } from "@/components/portfolio-section-tabs";
import { PortfolioStatTabs } from "@/components/portfolio-stat-tabs";
import { PortfolioVizTabs } from "@/components/portfolio-viz-tabs";
import { PositionForm } from "@/components/position-form";
import { PositionTreemap } from "@/components/position-treemap";
import { SellForm } from "@/components/sell-form";
import {
  cancelPlannedAction,
  deferPlannedAction,
  restorePlannedAction,
} from "@/lib/actions/planned-actions";
import { listSleeveDiagnosticRecords } from "@/lib/data/drawdown-diagnostic";
import { getLedgerSummary } from "@/lib/data/ledger";
import { appendLiveChartPoint, buildNavChartSeries } from "@/lib/data/nav-series";
import { getPerformanceReport } from "@/lib/data/performance";
import {
  buildDeploymentQueue,
  listOpenPlannedActions,
} from "@/lib/data/planned-actions";
import { isOperator } from "@/lib/auth/operator";
import { getOpenPortfolioBook, withLiveMarks } from "@/lib/data/portfolio";
import { listInstrumentsWithThemes } from "@/lib/data/research";
import {
  computeDrawdown,
  listLedgerFlows,
  listPortfolioSnapshots,
  snapshotFlagsForDrawdown,
} from "@/lib/data/snapshots";
import {
  parseChartTab,
  parseMapColor,
  parseSectionTab,
  parseStatsTab,
  parseVizTab,
  portfolioHref,
  type PortfolioQuery,
  type PortfolioSectionTab,
  type StatsTab,
} from "@/lib/portfolio-href";

export const dynamic = "force-dynamic";

type PortfolioTab = PortfolioSectionTab;

function money(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function signedMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const formatted = money(value);
  return value > 0 ? `+${formatted}` : formatted;
}

function pct(
  value: number | null | undefined,
  signed = false,
  digits = 1,
): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function signedClass(value: number | null | undefined): string | undefined {
  if (value == null) return undefined;
  if (value > 0) return "is-up";
  if (value < 0) return "is-down";
  return undefined;
}

function parseTab(raw: string | undefined): PortfolioTab | null {
  return parseSectionTab(raw);
}

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    stats?: string;
    viz?: string;
    chart?: string;
    map?: string;
    add?: string;
    cash?: string;
    plan?: string;
    confirm?: string;
    sell?: string;
  }>;
}) {
  const {
    tab,
    stats: statsRaw,
    viz: vizRaw,
    chart: chartRaw,
    map: mapRaw,
    add,
    cash: cashEdit,
    plan,
    confirm,
    sell,
  } = await searchParams;
  const [
    operator,
    rawBook,
    instruments,
    rawQueue,
    ledger,
    snapshots,
    flows,
    diagnosticRecords,
  ] =
    await Promise.all([
      isOperator(),
      getOpenPortfolioBook(),
      listInstrumentsWithThemes(),
      listOpenPlannedActions(),
      getLedgerSummary(),
      listPortfolioSnapshots(),
      listLedgerFlows(),
      listSleeveDiagnosticRecords(),
    ]);
  const book = await withLiveMarks(rawBook);
  const performance = await getPerformanceReport({
    asOf: book.markAsOf ?? new Date().toISOString(),
    nav: book.nav,
    invested: book.invested,
    positionsValue: book.marketValue,
  });
  const queue = buildDeploymentQueue(book, instruments, rawQueue);
  const liveMark = {
    nav: book.nav,
    invested: book.invested,
    positionsValue: book.marketValue,
    asOf: book.markAsOf ?? new Date().toISOString(),
  };
  const drawdown = computeDrawdown(snapshots, liveMark, flows);
  const riskFlags = [
    ...book.flags,
    ...snapshotFlagsForDrawdown(
      snapshots,
      drawdown,
      liveMark,
      flows,
      diagnosticRecords,
    ),
  ];
  // Viewers get the book read-only. Hiding the controls is not the security
  // boundary — RLS and requireOperator() are — but it is the difference between
  // a read-only guest and one who clicks "Add fill" and gets a Postgres error.
  const showForm = operator && add === "1";
  const showCash = operator && cashEdit === "1";
  const showPlan = operator && plan === "1";
  const confirmAction =
    operator && confirm != null
      ? (queue.actions.find((row) => row.id === confirm) ?? null)
      : null;
  const sellPositionRow =
    operator && sell != null
      ? (book.positions.find((row) => row.id === sell) ?? null)
      : null;
  const busy =
    showForm ||
    showCash ||
    showPlan ||
    confirmAction != null ||
    sellPositionRow != null;
  // A flow parameter decides the tab so every action lands on the surface it belongs to.
  const activeTab: PortfolioTab =
    showPlan || confirmAction != null
      ? "queue"
      : showForm || sellPositionRow != null
        ? "book"
        : showCash
          ? "ledger"
          : (parseTab(tab) ?? "book");
  // Return on capital actually committed, which deposits make measurable.
  const totalReturnPct =
    ledger.depositedCapital > 0
      ? ((book.nav - ledger.depositedCapital) / ledger.depositedCapital) * 100
      : null;
  const phase1RemainingUsd =
    RISK_DEFAULTS.phase1InvestedCapUsd - book.invested;
  const cashAfterQueueUsd = book.cash - queue.totalPlannedUsd;
  const cashAfterQueuePctNav =
    book.nav > 0 ? (cashAfterQueueUsd / book.nav) * 100 : null;
  const bookWarnings = riskFlags.filter((flag) => flag.severity === "warn");
  const queueWarnings = queue.flags.filter((flag) => flag.severity === "warn");
  const statsTab = parseStatsTab(statsRaw);
  const vizTab = parseVizTab(vizRaw);
  const chartTab = parseChartTab(chartRaw);
  const mapColor = parseMapColor(mapRaw);
  const snapshotSeries = buildNavChartSeries(snapshots, flows);
  const navSeries =
    book.markAsOf == null
      ? snapshotSeries
      : appendLiveChartPoint(
          snapshotSeries,
          {
            asOf: book.markAsOf,
            nav: book.nav,
            cash: book.cash,
            invested: book.invested,
            positionsValue: book.marketValue,
            dayPnl: book.dayPnl,
          },
          flows,
        );
  const href = (patch: Partial<PortfolioQuery> = {}) =>
    portfolioHref({
      stats: statsTab,
      viz: vizTab,
      chart: chartTab,
      map: mapColor,
      tab: activeTab,
      ...patch,
    });

  const bookPanel = (
    <section className="panel" aria-label="Open book">
      <h2>Open book</h2>
      {book.positions.length === 0 ? (
        <p className="empty">
          No open positions yet. Confirm a queued fill or add an unplanned
          fill.
        </p>
      ) : (
        <ul className="list position-list">
          {book.positions.map((position) => {
            const oversize =
              position.weightPctNav != null &&
              position.weightPctNav > RISK_DEFAULTS.maxPositionPctNav;

            return (
              <li key={position.id}>
                <div>
                  <strong>
                    <Link href={`/explore/${position.symbol}`}>
                      {position.symbol}
                    </Link>
                  </strong>
                  <span className="muted">
                    {" "}
                    {position.name} · {position.themeName}
                  </span>
                  <p className="position-meta">
                    {position.quantity.toLocaleString(undefined, {
                      maximumFractionDigits: 5,
                    })}{" "}
                    @ {money(position.avgCost)} · mark{" "}
                    {money(position.markPrice)}
                    {position.weightPctNav != null
                      ? ` · ${pct(position.weightPctNav)} NAV`
                      : ""}
                    {position.priceSource === "live" ? (
                      <span className="tag"> {book.markLabel}</span>
                    ) : null}
                    {oversize ? (
                      <span className="tag warn-tag">
                        {" "}
                        above {RISK_DEFAULTS.maxPositionPctNav}% cap
                      </span>
                    ) : null}
                  </p>
                  {position.thesisSummary ? (
                    <p className="muted">{position.thesisSummary}</p>
                  ) : null}
                  {position.invalidation ? (
                    <details className="kill-criteria">
                      <summary>Kill criteria</summary>
                      <p className="muted">{position.invalidation}</p>
                    </details>
                  ) : (
                    <p className="muted">
                      <span className="tag warn-tag">
                        No kill criteria — mandate rule 4 violation
                      </span>
                    </p>
                  )}
                </div>
                <div className="position-mtm">
                  <strong>{money(position.marketValue)}</strong>
                  <span className={signedClass(position.dayPnl)}>
                    {signedMoney(position.dayPnl)} (
                    {pct(position.dayPnlPct, true)}) today
                  </span>
                  <span className={signedClass(position.unrealizedPnl)}>
                    {signedMoney(position.unrealizedPnl)} (
                    {pct(position.unrealizedPnlPct, true)}) vs cost
                  </span>
                  {operator ? (
                    <Link href={href({ sell: position.id, tab: "book" })}>
                      Sell or close
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  const queuePanel = (
    <section className="panel" aria-label="Deployment queue">
      <h2>Deployment queue</h2>
      <p className="muted">
        Intend here, execute at the broker, then confirm the fill. Find dated
        work on <Link href="/briefing">Briefing Dated</Link>. Queue vs current
        NAV: cash after {money(queue.cashAfter)} (
        {pct(queue.cashPctAfter)}), invested after {money(queue.investedAfter)}.
      </p>
      {queue.flags.length > 0 ? (
        <ul className="list">
          {queue.flags.map((flag) => (
            <li key={`queue-${flag.label}`}>
              <span className={flag.severity === "warn" ? "is-down" : "is-up"}>
                {flag.severity === "warn" ? "Flag" : "OK"}
              </span>
              <span>{flag.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {queue.actions.length === 0 ? (
        <p className="empty">
          No pending buys. Plan a stub before you hit the tape.
        </p>
      ) : (
        <ul className="list position-list">
          {queue.actions.map((action) => (
            <li key={action.id}>
              <div>
                <strong>
                  <Link href={`/explore/${action.symbol}`}>
                    {action.symbol}
                  </Link>
                </strong>
                <span className="muted">
                  {" "}
                  {action.name} · {action.actionType}
                  {action.status === "deferred" ? " · deferred" : ""}
                </span>
                <p className="position-meta">
                  {money(action.plannedUsd)}
                  {action.plannedPctNav != null
                    ? ` · ${pct(action.plannedPctNav)} NAV`
                    : ""}
                  {action.windowLabel ? ` · ${action.windowLabel}` : ""}
                  {action.dueBy ? ` · due ${action.dueBy}` : ""}
                </p>
                {action.rationale ? (
                  <p className="muted">{action.rationale}</p>
                ) : null}
              </div>
              <div className="queue-actions">
                {operator ? (
                  <Link href={href({ confirm: action.id, tab: "queue" })}>
                    Confirm
                  </Link>
                ) : null}
                {operator && action.status === "deferred" ? (
                  <form action={restorePlannedAction}>
                    <input type="hidden" name="id" value={action.id} />
                    <button type="submit">Restore</button>
                  </form>
                ) : null}
                {operator && action.status !== "deferred" ? (
                  <form action={deferPlannedAction}>
                    <input type="hidden" name="id" value={action.id} />
                    <button type="submit">Defer</button>
                  </form>
                ) : null}
                {operator ? (
                  <form action={cancelPlannedAction}>
                    <input type="hidden" name="id" value={action.id} />
                    <button type="submit">Cancel</button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const inception = performance.windows.find((row) => row.id === "inception");

  const performancePanel = (
    <section className="panel" aria-label="Benchmark performance">
      <h2>Performance</h2>
      <p className="muted">
        Success = S&amp;P 500 total return (SPY). Style = Nasdaq-100 total
        return (QQQ). NAV includes cash and grades the cash decision; the
        deployed sleeve grades stock picking. No blended policy portfolio.
      </p>
      {performance.windows.length === 0 ? (
        <p className="empty">
          Need two NAV marks to score a window. The nightly snapshot job
          builds the series.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Window</th>
                <th>NAV</th>
                <th>vs SPY</th>
                <th>vs QQQ</th>
                <th>Deployed</th>
                <th>vs SPY</th>
                <th>vs QQQ</th>
              </tr>
            </thead>
            <tbody>
              {performance.windows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.label}
                    <div className="muted">
                      {row.start} → {row.end}
                    </div>
                  </td>
                  <td className={signedClass(row.navReturn)}>
                    {pct(row.navReturn == null ? null : row.navReturn * 100, true)}
                  </td>
                  <td className={signedClass(row.navVsSuccess)}>
                    {pct(
                      row.navVsSuccess == null ? null : row.navVsSuccess * 100,
                      true,
                    )}
                  </td>
                  <td className={signedClass(row.navVsStyle)}>
                    {pct(
                      row.navVsStyle == null ? null : row.navVsStyle * 100,
                      true,
                    )}
                  </td>
                  <td className={signedClass(row.deployedReturn)}>
                    {pct(
                      row.deployedReturn == null
                        ? null
                        : row.deployedReturn * 100,
                      true,
                    )}
                  </td>
                  <td className={signedClass(row.deployedVsSuccess)}>
                    {pct(
                      row.deployedVsSuccess == null
                        ? null
                        : row.deployedVsSuccess * 100,
                      true,
                    )}
                  </td>
                  <td className={signedClass(row.deployedVsStyle)}>
                    {pct(
                      row.deployedVsStyle == null
                        ? null
                        : row.deployedVsStyle * 100,
                      true,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {performance.notes.length > 0 ? (
        <ul className="list">
          {performance.notes.map((note) => (
            <li key={note}>
              <span className="muted">{note}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );

  const mandatePanel = (
    <section className="panel" aria-label="Mandate checks">
      <h2>Mandate</h2>
      <p className="muted">
        Live compliance vs the book. Full rules on the{" "}
        <Link href="/docs/mandate">Mandate page</Link>.
      </p>
      <ul className="list">
        {riskFlags.map((flag) => (
          <li key={`book-${flag.label}`}>
            <span className={flag.severity === "warn" ? "is-down" : "is-up"}>
              {flag.severity === "warn" ? "Flag" : "OK"}
            </span>
            <span>{flag.label}</span>
          </li>
        ))}
      </ul>
      {book.themeExposures.length > 0 ? (
        <ul className="list">
          {book.themeExposures.map((theme) => (
            <li key={theme.slug}>
              <div>
                <strong>{theme.name}</strong>
                <span className="muted"> · {money(theme.marketValue)}</span>
              </div>
              <span className={theme.overCap ? "is-down" : undefined}>
                {pct(theme.weightPctNav)} NAV
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );

  const ledgerPanel = (
    <section className="panel" aria-label="Ledger">
      <h2>Ledger</h2>
      <p className="muted">
        Every balance above is the sum of these entries. History is append-only,
        so a mistake is corrected with an adjustment rather than an edit.
      </p>
      {ledger.entries.length === 0 ? (
        <p className="empty">
          No entries yet. Record a deposit to open the book.
        </p>
      ) : (
        <ul className="list position-list">
          {ledger.entries.map((entry) => (
            <li key={entry.id}>
              <div>
                <strong>
                  {entry.kind}
                  {entry.symbol ? ` ${entry.symbol}` : ""}
                </strong>
                {entry.source !== "manual" ? (
                  <span className="tag"> {entry.source}</span>
                ) : null}
                <p className="position-meta">
                  {new Date(entry.occurredAt).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  {entry.quantity != null && entry.price != null
                    ? ` · ${entry.quantity.toLocaleString(undefined, {
                        maximumFractionDigits: 8,
                      })} @ ${money(entry.price)}`
                    : ""}
                </p>
                {entry.notes ? <p className="muted">{entry.notes}</p> : null}
              </div>
              <div className="position-mtm">
                <strong className={entry.cashDelta > 0 ? "is-up" : undefined}>
                  {entry.cashDelta > 0 ? "+" : ""}
                  {money(entry.cashDelta)}
                </strong>
                {entry.realizedPnl != null ? (
                  <span
                    className={entry.realizedPnl >= 0 ? "is-up" : "is-down"}
                  >
                    realized {money(entry.realizedPnl)}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <>
      <LiveMarksRefresh active={book.tapeActive} />
      <header className="page-header">
        <div>
          <h1>Portfolio</h1>
          <p>
            NAV = cash + marked positions ({book.markLabel.toLowerCase()}
            {book.markAsOf
              ? ` as of ${new Date(book.markAsOf).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                  timeZoneName: "short",
                })}`
              : ""}
            ). Plan buys in the queue, then confirm the fill. Weights are % of
            NAV (max name {RISK_DEFAULTS.maxPositionPctNav}%, max theme{" "}
            {RISK_DEFAULTS.maxThemePctNav}%, min cash {RISK_DEFAULTS.minCashPctNav}
            %).
          </p>
        </div>
        <div className="header-actions">
          {!operator ? (
            <span className="muted">Read-only access</span>
          ) : busy ? (
            <Link
              className="buttonish subtle"
              href={href({})}
            >
              Cancel
            </Link>
          ) : (
            <>
              <Link
                className="buttonish subtle"
                href={href({ cash: "1", tab: "ledger" })}
              >
                Cash entry
              </Link>
              <Link
                className="buttonish subtle"
                href={href({ add: "1", tab: "book" })}
              >
                Add fill
              </Link>
              <Link className="buttonish" href={href({ plan: "1", tab: "queue" })}>
                Plan buy
              </Link>
            </>
          )}
        </div>
      </header>

      <PortfolioStatTabs
        initialTab={statsTab}
        panels={{
          book: (
          <div className="stat-row stats-5">
            <div className="stat">
              <span>NAV ({book.markLabel.toLowerCase()})</span>
              <strong>{money(book.nav)}</strong>
            </div>
            <div className="stat">
              <span>Daily change</span>
              <strong className={signedClass(book.dayPnl)}>
                {signedMoney(book.dayPnl)}
              </strong>
              <em className={`stat-note ${signedClass(book.dayPnlPct) ?? ""}`.trim()}>
                {pct(book.dayPnlPct, true, 2)} vs prior close
              </em>
            </div>
            <div className="stat">
              <span>Cash</span>
              <strong>{money(book.cash)}</strong>
              <em
                className={
                  book.cashPctNav < RISK_DEFAULTS.minCashPctNav
                    ? "stat-note is-down"
                    : "stat-note"
                }
              >
                {pct(book.cashPctNav)} NAV
              </em>
            </div>
            <div className="stat">
              <span>Invested (cost)</span>
              <strong>{money(book.invested)}</strong>
              <em className="stat-note">
                of {money(RISK_DEFAULTS.phase1InvestedCapUsd)} phase-1
              </em>
            </div>
            <div className="stat">
              <span>Unrealized P&amp;L</span>
              <strong className={signedClass(book.unrealizedPnl)}>
                {signedMoney(book.unrealizedPnl)}
              </strong>
            </div>
          </div>
          ),
          score: (
          <div className="stat-row">
            <div className="stat">
              <span>Total return</span>
              <strong
                className={
                  totalReturnPct == null
                    ? undefined
                    : totalReturnPct > 0
                      ? "is-up"
                      : totalReturnPct < 0
                        ? "is-down"
                        : undefined
                }
              >
                {pct(totalReturnPct, true)}
              </strong>
              <em className="stat-note">on {money(ledger.depositedCapital)}</em>
            </div>
            <div className="stat">
              <span>NAV vs SPY</span>
              <strong className={signedClass(inception?.navVsSuccess)}>
                {pct(
                  inception?.navVsSuccess == null
                    ? null
                    : inception.navVsSuccess * 100,
                  true,
                )}
              </strong>
              <em className="stat-note">since inception</em>
            </div>
            <div className="stat">
              <span>Deployed vs SPY</span>
              <strong className={signedClass(inception?.deployedVsSuccess)}>
                {pct(
                  inception?.deployedVsSuccess == null
                    ? null
                    : inception.deployedVsSuccess * 100,
                  true,
                )}
              </strong>
              <em className="stat-note">stock picking</em>
            </div>
            <div className="stat">
              <span>Realized P&amp;L</span>
              <strong
                className={
                  ledger.realizedPnl > 0
                    ? "is-up"
                    : ledger.realizedPnl < 0
                      ? "is-down"
                      : undefined
                }
              >
                {money(ledger.realizedPnl)}
              </strong>
            </div>
          </div>
          ),
          deployment: (
          <div className="stat-row">
            <div className="stat">
              <span>Open positions</span>
              <strong>{book.openCount}</strong>
            </div>
            <div className="stat">
              <span>Queued to deploy</span>
              <strong>{money(queue.totalPlannedUsd)}</strong>
            </div>
            <div className="stat">
              <span>Phase-1 remaining</span>
              <strong className={phase1RemainingUsd < 0 ? "is-down" : undefined}>
                {money(phase1RemainingUsd)}
              </strong>
            </div>
            <div className="stat">
              <span>Cash after queue</span>
              <strong
                className={
                  cashAfterQueuePctNav != null &&
                  cashAfterQueuePctNav < RISK_DEFAULTS.minCashPctNav
                    ? "is-down"
                    : undefined
                }
              >
                {money(cashAfterQueueUsd)}
              </strong>
              {cashAfterQueuePctNav != null ? (
                <em
                  className={
                    cashAfterQueuePctNav < RISK_DEFAULTS.minCashPctNav
                      ? "stat-note is-down"
                      : "stat-note"
                  }
                >
                  {pct(cashAfterQueuePctNav)} NAV
                </em>
              ) : null}
            </div>
          </div>
          ),
        }}
      />

      <PortfolioVizTabs
        initialTab={vizTab}
        panels={{
          map: (
            <PositionTreemap
              positions={book.positions}
              markLabel={book.markLabel}
              initialColor={mapColor}
            />
          ),
          nav: <NavHistoryChart points={navSeries} initialView={chartTab} />,
        }}
      />

      <PortfolioSectionTabs
        initialTab={activeTab}
        badges={{
          book: book.openCount,
          queue: queue.actions.length,
          ledger: ledger.entryCount,
        }}
        warnings={{
          mandate: bookWarnings.length > 0,
          queue: queueWarnings.length > 0,
        }}
        panels={{
          book: {
            form: (
              <>
                {sellPositionRow ? (
                  <section className="panel">
                    <h2>Sell {sellPositionRow.symbol}</h2>
                    <SellForm position={sellPositionRow} />
                  </section>
                ) : null}
                {showForm ? (
                  <section className="panel">
                    <h2>Add fill</h2>
                    <p className="muted">
                      Unplanned fill (already executed). Prefer the queue for
                      new risk. Cash available: {money(book.cash)}.
                    </p>
                    <PositionForm instruments={instruments} />
                  </section>
                ) : null}
              </>
            ),
            body: bookPanel,
          },
          queue: {
            form: (
              <>
                {confirmAction ? (
                  <section className="panel">
                    <h2>Confirm fill</h2>
                    <ConfirmFillForm action={confirmAction} />
                  </section>
                ) : null}
                {showPlan ? (
                  <section className="panel">
                    <h2>Plan a buy</h2>
                    <p className="muted">
                      Size in dollars, not shares. This does not debit cash
                      until you confirm a fill.
                    </p>
                    <PlannedActionForm instruments={instruments} />
                  </section>
                ) : null}
              </>
            ),
            body: queuePanel,
          },
          mandate: { body: mandatePanel },
          performance: { body: performancePanel },
          ledger: {
            form: showCash ? (
              <section className="panel">
                <h2>Cash entry</h2>
                <p className="muted">
                  Cash is the sum of the ledger, so it changes only through
                  entries. Current balance {money(book.cash)}.
                </p>
                <CashEntryForm />
              </section>
            ) : null,
            body: ledgerPanel,
          },
        }}
      />
    </>
  );
}
