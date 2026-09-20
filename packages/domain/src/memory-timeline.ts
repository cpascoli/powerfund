import { utcDay } from "./dates";

/**
 * The three memories the operating process names, plus the clock that drives
 * them.
 *
 * `gpt-agent-process.md`'s historical review gate says a review reading only two
 * of the three is working from a partial record — and that the portfolio one is
 * the one most often skipped, because its conclusions were in a recent
 * conversation. This groups them under one axis so "what should I have read
 * before this ritual" is a question you can answer by looking.
 */
export type MemoryKind = "company" | "decision" | "portfolio" | "calendar";

export const MEMORY_KINDS: readonly MemoryKind[] = [
  "company",
  "decision",
  "portfolio",
  "calendar",
] as const;

export function isMemoryKind(value: string): value is MemoryKind {
  return (MEMORY_KINDS as readonly string[]).includes(value);
}

export type MemoryEvent = {
  /** Stable and URL-safe: `<kind>:<uuid>`. */
  id: string;
  kind: MemoryKind;
  /** When the memory was made, not when the row was written. */
  at: string;
  symbol: string | null;
  title: string;
  /** One line for the stream. The overlay carries the rest. */
  summary: string | null;
  /** Small caps label under the icon — "v4", "hold", "portfolio". */
  badge: string | null;
  /**
   * A calendar event that has not happened yet. It is memory in the sense that
   * it is an obligation already recorded, so it belongs on the axis — but ahead
   * of today rather than behind it.
   */
  future: boolean;
};

export type MemoryDayGroup = {
  date: string;
  events: MemoryEvent[];
  counts: Record<MemoryKind, number>;
};

/** Newest first, and within a day newest first, so the stream reads backwards. */
export function groupMemoryByDay(events: MemoryEvent[]): MemoryDayGroup[] {
  const byDay = new Map<string, MemoryEvent[]>();
  for (const event of events) {
    const day = utcDay(event.at);
    const list = byDay.get(day) ?? [];
    list.push(event);
    byDay.set(day, list);
  }
  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => {
      const counts: Record<MemoryKind, number> = {
        company: 0,
        decision: 0,
        portfolio: 0,
        calendar: 0,
      };
      for (const event of list) counts[event.kind] += 1;
      return {
        date,
        events: [...list].sort((a, b) => b.at.localeCompare(a.at)),
        counts,
      };
    });
}

export type MemoryStripBucket = {
  /** First day in the bucket; the anchor a click scrolls to. */
  date: string;
  /** Inclusive last day, equal to `date` when bucketing daily. */
  endDate: string;
  counts: Record<MemoryKind, number>;
  total: number;
};

export type MemoryStrip = {
  buckets: MemoryStripBucket[];
  /** Days per bucket. 1 while the history is short, 7 once it is not. */
  bucketDays: number;
  /** Busiest single bucket, so intensity can be scaled against something real. */
  peak: number;
};

const DAY_MS = 86_400_000;

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * The strip above the stream: one column per bucket, one row per memory kind.
 *
 * Buckets widen with the span rather than the count, so the strip stays a fixed
 * readable width as history accumulates. Five weeks of daily columns is legible;
 * a year of them is a smear, and a year of weekly ones is the same picture at
 * the same size.
 *
 * Empty buckets are kept. The gaps are the point — a week with no portfolio
 * memory is exactly what the historical review gate is trying to make visible.
 */
export function buildMemoryStrip(
  events: MemoryEvent[],
  options?: { maxBuckets?: number },
): MemoryStrip {
  if (events.length === 0) {
    return { buckets: [], bucketDays: 1, peak: 0 };
  }
  const maxBuckets = options?.maxBuckets ?? 60;
  const days = events.map((event) => utcDay(event.at)).sort();
  const first = days[0]!;
  const last = days[days.length - 1]!;
  const span =
    Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / DAY_MS) + 1;
  const bucketDays = span <= maxBuckets ? 1 : Math.ceil(span / maxBuckets);

  const buckets: MemoryStripBucket[] = [];
  for (let offset = 0; offset < span; offset += bucketDays) {
    buckets.push({
      date: addDays(first, offset),
      endDate: addDays(first, Math.min(offset + bucketDays - 1, span - 1)),
      counts: { company: 0, decision: 0, portfolio: 0, calendar: 0 },
      total: 0,
    });
  }

  for (const event of events) {
    const day = utcDay(event.at);
    const offset = Math.round(
      (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / DAY_MS,
    );
    const bucket = buckets[Math.floor(offset / bucketDays)];
    if (bucket == null) continue;
    bucket.counts[event.kind] += 1;
    bucket.total += 1;
  }

  return {
    buckets,
    bucketDays,
    peak: buckets.reduce((max, row) => (row.total > max ? row.total : max), 0),
  };
}

/**
 * Where a bucket's fill sits between nothing and the busiest bucket.
 *
 * Square-rooted because one day seeded 46 dossier versions while an ordinary
 * day carries two or three. Linear scaling would render every real working day
 * as indistinguishable from empty, which is the opposite of what the strip is
 * for: the rhythm matters more than the outlier.
 */
export function stripIntensity(count: number, peak: number): number {
  if (count <= 0 || peak <= 0) return 0;
  return Math.min(1, Math.sqrt(count) / Math.sqrt(peak));
}
