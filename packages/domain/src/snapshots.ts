import { fillSessionDate } from "./dates";
import { roundQuantity, toCents } from "./money";
import type { TransactionKind } from "./types";

/**
 * Rebuilding NAV history from the ledger and stored closes.
 *
 * The nightly job used to stamp a snapshot with wall-clock run time and mark it
 * with "the newest bar for this instrument, whatever its date". When the cron
 * ran late the row was labelled with a session it did not hold, and the backfill
 * then reconstructed the genuinely-missing day from the same closes — producing
 * two identical rows and a NAV series shifted by one day.
 *
 * Everything here is keyed on a **session**: the ledger decides what was held at
 * that session's close, and only that session's bars may mark it. Marks that had
 * to fall back to an earlier close are named in `staleMarks` and carry their real
 * `closeDate`, so the provenance of every number is checkable after the fact.
 */

export type LedgerEntry = {
  occurredAt: string;
  kind: TransactionKind;
  instrumentId: string | null;
  quantity: number | null;
  cashDelta: number;
  basisDelta: number | null;
};

/** session date → instrument id → close for that exact session. */
export type SessionCloses = ReadonlyMap<string, ReadonlyMap<string, number>>;

export type SnapshotPositionMark = {
  instrumentId: string;
  quantity: number;
  /** Cost basis carried at this session. */
  invested: number;
  close: number | null;
  /** Session the close actually came from. Equal to the snapshot session unless stale. */
  closeDate: string | null;
  value: number;
};

export type ReconstructedSnapshot = {
  session: string;
  cash: number;
  invested: number;
  positionsValue: number;
  nav: number;
  positions: SnapshotPositionMark[];
  /** Held instruments with no bar for this session — marked from an older close, or at cost. */
  staleMarks: string[];
};

/** Quantities below this are treated as fully closed. */
const DUST = 1e-9;

function sessionsOf(entries: readonly LedgerEntry[]): Map<string, string> {
  const cache = new Map<string, string>();
  for (const entry of entries) {
    if (cache.has(entry.occurredAt)) continue;
    cache.set(entry.occurredAt, fillSessionDate(entry.occurredAt));
  }
  return cache;
}

/**
 * Rebuild one snapshot per session. `closes` must contain only the bar for each
 * exact session; `priorCloses` supplies the most recent close on or before a
 * session so a name whose bar is missing carries forward instead of snapping
 * back to cost.
 */
export function reconstructSnapshots(args: {
  entries: readonly LedgerEntry[];
  sessions: readonly string[];
  closes: SessionCloses;
  priorClose?: (instrumentId: string, session: string) => {
    close: number;
    date: string;
  } | null;
}): ReconstructedSnapshot[] {
  const sessionByEntry = sessionsOf(args.entries);
  const ordered = [...args.sessions].sort();
  const out: ReconstructedSnapshot[] = [];

  for (const session of ordered) {
    let cash = 0;
    const holdings = new Map<string, { quantity: number; invested: number }>();

    for (const entry of args.entries) {
      const entrySession = sessionByEntry.get(entry.occurredAt);
      if (entrySession == null || entrySession > session) continue;
      cash += entry.cashDelta;
      if (entry.instrumentId == null) continue;
      if (entry.kind !== "buy" && entry.kind !== "sell") continue;
      const current = holdings.get(entry.instrumentId) ?? {
        quantity: 0,
        invested: 0,
      };
      const signed =
        entry.kind === "buy"
          ? Number(entry.quantity ?? 0)
          : -Number(entry.quantity ?? 0);
      current.quantity += signed;
      current.invested += Number(entry.basisDelta ?? 0);
      holdings.set(entry.instrumentId, current);
    }

    const sessionCloses = args.closes.get(session);
    const positions: SnapshotPositionMark[] = [];
    const staleMarks: string[] = [];
    let invested = 0;
    let positionsValue = 0;

    for (const [instrumentId, holding] of holdings) {
      const quantity = roundQuantity(holding.quantity);
      if (quantity <= DUST) continue;
      const cost = toCents(holding.invested);
      invested += cost;

      const sessionClose = sessionCloses?.get(instrumentId) ?? null;
      let close: number | null = sessionClose;
      let closeDate: string | null = sessionClose == null ? null : session;
      if (close == null) {
        const carried = args.priorClose?.(instrumentId, session) ?? null;
        if (carried != null) {
          close = carried.close;
          closeDate = carried.date;
        }
        staleMarks.push(instrumentId);
      }

      const value = toCents(close == null ? cost : quantity * close);
      positionsValue += value;
      positions.push({
        instrumentId,
        quantity,
        invested: cost,
        close,
        closeDate,
        value,
      });
    }

    const roundedCash = toCents(cash);
    positionsValue = toCents(positionsValue);
    out.push({
      session,
      cash: roundedCash,
      invested: toCents(invested),
      positionsValue,
      nav: toCents(roundedCash + positionsValue),
      positions,
      staleMarks,
    });
  }

  return out;
}

export type SnapshotAlignmentIssue = {
  session: string;
  code: "mark_from_other_session" | "unreported_stale_mark" | "duplicate_marks";
  detail: string;
};

/**
 * The invariant the old pipeline broke: every mark in a snapshot either comes
 * from that snapshot's own session, or is declared stale. A second check catches
 * the duplicate-row signature — two consecutive sessions holding byte-identical
 * position values with no flow between them.
 */
export function snapshotAlignmentIssues(
  snapshots: readonly ReconstructedSnapshot[],
): SnapshotAlignmentIssue[] {
  const issues: SnapshotAlignmentIssue[] = [];
  let previous: ReconstructedSnapshot | null = null;

  for (const snapshot of snapshots) {
    const declared = new Set(snapshot.staleMarks);
    for (const position of snapshot.positions) {
      if (position.closeDate == null) {
        if (!declared.has(position.instrumentId)) {
          issues.push({
            session: snapshot.session,
            code: "unreported_stale_mark",
            detail: `${position.instrumentId} is marked at cost but is not in staleMarks`,
          });
        }
        continue;
      }
      if (position.closeDate !== snapshot.session) {
        if (!declared.has(position.instrumentId)) {
          issues.push({
            session: snapshot.session,
            code: "mark_from_other_session",
            detail: `${position.instrumentId} is marked from ${position.closeDate}`,
          });
        }
      }
    }

    if (
      previous != null &&
      previous.positions.length > 0 &&
      previous.positions.length === snapshot.positions.length &&
      previous.positionsValue === snapshot.positionsValue &&
      snapshot.staleMarks.length === 0 &&
      previous.staleMarks.length === 0
    ) {
      issues.push({
        session: snapshot.session,
        code: "duplicate_marks",
        detail: `positions value ${snapshot.positionsValue} repeats ${previous.session}`,
      });
    }
    previous = snapshot;
  }

  return issues;
}
