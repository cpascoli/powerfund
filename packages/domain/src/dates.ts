const NY = "America/New_York";
const CASH_CLOSE_HOUR = 16;
const CASH_CLOSE_MINUTE = 0;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const WEEKDAY_SHORT: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** UTC calendar day of an ISO instant. */
export function utcDay(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/** Latest Mon–Fri UTC date on or before `date` (YYYY-MM-DD). Ignores exchange holidays. */
export function lastWeekdayOnOrBefore(date: string): string {
  let cursor = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(cursor)) return date;
  for (let i = 0; i < 7; i += 1) {
    const weekday = new Date(cursor).getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      return new Date(cursor).toISOString().slice(0, 10);
    }
    cursor -= 86_400_000;
  }
  return date;
}

/** Earliest Mon–Fri UTC date on or after `date` (YYYY-MM-DD). Ignores exchange holidays. */
export function nextWeekdayOnOrAfter(date: string): string {
  let cursor = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(cursor)) return date;
  for (let i = 0; i < 7; i += 1) {
    const weekday = new Date(cursor).getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      return new Date(cursor).toISOString().slice(0, 10);
    }
    cursor += 86_400_000;
  }
  return date;
}

function nyWall(instant: Date): {
  ymd: string;
  hour: number;
  minute: number;
  weekday: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NY,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: WEEKDAY_SHORT[get("weekday")] ?? 0,
  };
}

function previousWeekday(ymd: string): string {
  const prior = Date.parse(`${ymd}T00:00:00Z`) - 86_400_000;
  return lastWeekdayOnOrBefore(new Date(prior).toISOString().slice(0, 10));
}

/** True when `instant` is at or after the 16:00 ET close on a weekday. */
function afterCash(ny: { hour: number; minute: number }): boolean {
  return (
    ny.hour > CASH_CLOSE_HOUR ||
    (ny.hour === CASH_CLOSE_HOUR && ny.minute >= CASH_CLOSE_MINUTE)
  );
}

/**
 * Session date of the last regular US cash close at or before `asOf`.
 * Close is 16:00 America/New_York. Weekends only — no holiday calendar.
 * A date-only `asOf` is the end of that calendar day (same as last weekday on or before it).
 */
export function lastCompletedCashSession(
  asOf: string = new Date().toISOString(),
): string {
  const trimmed = asOf.trim();
  if (DATE_ONLY.test(trimmed)) {
    return lastWeekdayOnOrBefore(trimmed);
  }
  const instant = new Date(trimmed);
  if (Number.isNaN(instant.getTime())) {
    return lastWeekdayOnOrBefore(utcDay(trimmed));
  }
  const ny = nyWall(instant);
  const weekday = ny.weekday >= 1 && ny.weekday <= 5;
  if (weekday && afterCash(ny)) return ny.ymd;
  return previousWeekday(ny.ymd);
}

/**
 * Session a fill booked at `asOf` belongs to — the key both the NAV marks and
 * the ledger flows must agree on.
 *
 * `transactions.occurred_at` is when the operator **booked** the fill in the UI,
 * not an exchange timestamp. In practice that is minutes to hours after the
 * session the trade executed in: the 13 Aug starters were typed in at 16:20–16:31
 * ET, and NBIS's 253.76 fill sits inside the 13 Aug range (247.38–275.96) and
 * outside the 14 Aug range (256.90–278.66). So the session is the trading day the
 * operator was in — the New York calendar day of the booking, walked back to the
 * last weekday when it falls on a weekend.
 *
 * Using the UTC calendar day instead is what let a flow land on a session whose
 * snapshot predated the trade: a fill booked after 20:00 ET is already tomorrow
 * in UTC. An after-hours trade booked after the close is marked at that session's
 * close, which is the conservative reading and the best the ledger supports until
 * it records an execution time distinct from the booking time.
 */
export function fillSessionDate(
  asOf: string = new Date().toISOString(),
): string {
  const trimmed = asOf.trim();
  if (DATE_ONLY.test(trimmed)) {
    return lastWeekdayOnOrBefore(trimmed);
  }
  const instant = new Date(trimmed);
  if (Number.isNaN(instant.getTime())) {
    return lastWeekdayOnOrBefore(utcDay(trimmed));
  }
  return lastWeekdayOnOrBefore(nyWall(instant).ymd);
}

/** True when bars do not reach the last completed US cash session at `asOf`. */
export function priceDataStale(
  through: string | null,
  asOf: string = new Date().toISOString(),
): boolean {
  if (through == null || through === "") return true;
  return through < lastCompletedCashSession(asOf);
}
